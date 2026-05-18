import { useState } from "react";
import OrderTypePicker from "./OrderTypePicker.jsx";
import TableSelector from "./TableSelector.jsx";
import POSCustomerPicker from "./POSCustomerPicker.jsx";
import POSMenu from "./POSMenu.jsx";
import POSConfirm from "./POSConfirm.jsx";
import POSSuccess from "./POSSuccess.jsx";

export default function POSOrder({ cashier, resumeTab, onCancel, onComplete }) {
  // Convert tab items (DB format) back to cart format
  const itemsToCart = (items) => (items || []).map(it => ({
    name: it.n || "",
    emoji: it.e || "",
    qty: it.q || 1,
    price: it.p || 0,
    addonTotal: it.addonTotal || 0,
    addons: it.addons || {},
  }));

  const initialState = resumeTab ? {
    type: resumeTab.type === "dine" ? "dine-in" : "take-away",
    table: (resumeTab.table && resumeTab.table !== "-")
      ? { id: resumeTab.table, name: resumeTab.table }
      : null,
    customerName: resumeTab.customer_name || resumeTab.customerName || "",
    customerId: resumeTab.customer_id || resumeTab.customerId || null,
    customerPhone: resumeTab.customer_phone || resumeTab.customerPhone || null,
    action: "openTab",
    cart: itemsToCart(resumeTab.items),
    subtotal: resumeTab.total || 0,
    created: null,
    resumeTabId: resumeTab.id,
  } : {
    type: null, table: null, customerName: "",
    action: null, cart: [], subtotal: 0, created: null
  };

  const [step, setStep] = useState(resumeTab ? "menu" : "type");
  const [order, setOrder] = useState(initialState);
  const update = (changes) => setOrder(o => ({ ...o, ...changes }));

  if (step === "type") return (
    <OrderTypePicker
      onPick={(type) => { update({ type }); setStep(type === "dine-in" ? "table" : "name"); }}
      onCancel={onCancel}
    />
  );

  if (step === "table") return (
    <TableSelector
      onPick={(table) => { update({ table }); setStep("name"); }}
      onBack={() => setStep("type")}
      onCancel={onCancel}
    />
  );

  if (step === "name") return (
    <POSCustomerPicker
      order={order}
      onContinue={(customer) => { update({ ...customer }); setStep("menu"); }}
      onBack={() => setStep(order.type === "dine-in" ? "table" : "type")}
      onCancel={onCancel}
    />
  );

  if (step === "menu") return (
    <POSMenu
      order={order}
      cashier={cashier}
      onBack={() => setStep("name")}
      onCancel={onCancel}
      onCheckout={({ action, cart, subtotal }) => {
        update({ action, cart, subtotal });
        setStep("confirm");
      }}
    />
  );

  if (step === "confirm") return (
    <POSConfirm
      order={order}
      cashier={cashier}
      onBack={() => setStep("menu")}
      onCancel={onCancel}
      onSuccess={(created) => {
        update({ created });
        setStep("success");
      }}
    />
  );

  if (step === "success") return (
    <POSSuccess
      created={order.created}
      order={order}
      cashier={cashier}
      onDone={onComplete}
      onAnother={() => {
        setOrder({
          type: null, table: null, customerName: "",
          action: null, cart: [], subtotal: 0, created: null
        });
        setStep("type");
      }}
    />
  );
}
