import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "";

interface ToastData {
  message: string;
  type: ToastType;
}

let showToastFn: ((message: string, type: ToastType) => void) | null = null;

export function showToast(message: string, type: ToastType = "") {
  showToastFn?.(message, type);
}

export function Toast() {
  const [data, setData] = useState<ToastData | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    showToastFn = (message: string, type: ToastType) => {
      setData({ message, type });
      setVisible(true);
      setTimeout(() => setVisible(false), 4000);
    };
    return () => {
      showToastFn = null;
    };
  }, []);

  if (!data) return null;

  const bgColor =
    data.type === "error"
      ? "bg-accent-red"
      : data.type === "success"
        ? "bg-[#238636]"
        : "bg-[#1f6feb]";

  return (
    <div
      className={`fixed bottom-6 right-6 px-6 py-3 rounded-lg text-[13px] text-white z-[200] transition-all duration-300 ${bgColor} ${
        visible ? "translate-y-0 opacity-100" : "translate-y-[100px] opacity-0"
      }`}
    >
      {data.message}
    </div>
  );
}
