import { useEffect, useState } from "react";

type NotificationBannerProps = {
  message: string;
  type: "success" | "error" | "info" | "warning";
  show: boolean;
  onClose: () => void;
};

export const NotificationBanner = ({ message, type, show, onClose }: NotificationBannerProps) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show) return null;

  const colors = {
    success: "from-emerald-500/20 to-green-500/20 border-emerald-500/40 text-emerald-100",
    error: "from-red-500/20 to-pink-500/20 border-red-500/40 text-red-100",
    info: "from-cyan-500/20 to-blue-500/20 border-cyan-500/40 text-cyan-100",
    warning: "from-amber-500/20 to-orange-500/20 border-amber-500/40 text-amber-100",
  };

  const icons = {
    success: "✅",
    error: "❌",
    info: "ℹ️",
    warning: "⚠️",
  };

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in-right">
      <div className={`rounded-xl border bg-gradient-to-r ${colors[type]} px-6 py-4 shadow-2xl backdrop-blur-sm max-w-md`}>
        <div className="flex items-start gap-3">
          <span className="text-2xl">{icons[type]}</span>
          <div className="flex-1">
            <p className="text-sm font-medium">{message}</p>
          </div>
          <button
            onClick={onClose}
            className="text-lg opacity-60 hover:opacity-100 transition"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
};
