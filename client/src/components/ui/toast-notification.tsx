import { useState, useEffect } from "react";
import { X, Check, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = 'success' | 'error' | 'info';

export interface ToastNotificationProps {
  message: string;
  type: ToastType;
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

export function ToastNotification({ 
  message, 
  type, 
  isVisible, 
  onClose, 
  duration = 3000 
}: ToastNotificationProps) {
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  const iconMap = {
    success: Check,
    error: AlertTriangle,
    info: Info,
  };

  const colorMap = {
    success: 'bg-success-green text-white',
    error: 'bg-error-red text-white', 
    info: 'bg-google-blue text-white',
  };

  const Icon = iconMap[type];

  return (
    <div
      className={cn(
        "fixed top-4 right-4 max-w-sm bg-white border border-gray-200 rounded-lg shadow-lg p-4 transform transition-transform duration-300 z-50",
        isVisible ? "translate-x-0" : "translate-x-full"
      )}
      data-testid="toast-notification"
    >
      <div className="flex items-center space-x-3">
        <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", colorMap[type])}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">{message}</p>
        </div>
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          data-testid="toast-close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function useToastNotification() {
  const [toast, setToast] = useState<{
    message: string;
    type: ToastType;
    isVisible: boolean;
  }>({
    message: '',
    type: 'info',
    isVisible: false,
  });

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({
      message,
      type,
      isVisible: true,
    });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  return {
    toast,
    showToast,
    hideToast,
  };
}
