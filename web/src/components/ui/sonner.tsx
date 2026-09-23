import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      toastOptions={{
        className: "border-border bg-popover text-popover-foreground",
      }}
      {...props}
    />
  );
}

export { Toaster };
