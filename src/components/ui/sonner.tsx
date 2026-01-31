"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          warning:
            "group-[.toaster]:bg-yellow-950 group-[.toaster]:text-yellow-500 group-[.toaster]:border-yellow-900",
          error:
            "group-[.toaster]:bg-red-950 group-[.toaster]:text-red-500 group-[.toaster]:border-red-900",
          success:
            "group-[.toaster]:bg-green-950 group-[.toaster]:text-green-500 group-[.toaster]:border-green-900",
          info: "group-[.toaster]:bg-blue-950 group-[.toaster]:text-blue-500 group-[.toaster]:border-blue-900",
        },
      }}
      position="top-right"
      expand={false}
      richColors
      closeButton
      {...props}
    />
  );
}

export { Toaster };
