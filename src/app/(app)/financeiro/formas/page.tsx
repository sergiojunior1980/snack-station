"use client";

import { useEffect } from "react";

export default function PaymentMethodsRedirect() {
  useEffect(() => {
    window.location.replace("/financeiro#formas");
  }, []);
  return null;
}
