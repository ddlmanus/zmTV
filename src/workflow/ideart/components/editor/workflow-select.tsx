import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

export const WorkflowSelect = SelectPrimitive.Root;
export const WorkflowSelectValue = SelectPrimitive.Value;
export const WorkflowSelectGroup = SelectPrimitive.Group;

export const WorkflowSelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-[11px] text-white/38", className)}
    {...props}
  />
));
WorkflowSelectLabel.displayName = SelectPrimitive.Label.displayName;

export const WorkflowSelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-8 min-w-0 items-center justify-between gap-2 rounded-lg border border-white/15 bg-transparent px-3 text-left text-[13px] text-[#f7f7f7] outline-none transition-colors hover:border-white/25 focus:border-[#478eff] disabled:cursor-not-allowed disabled:opacity-45",
      className,
    )}
    {...props}
  >
    <span className="min-w-0 flex-1 truncate">{children}</span>
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="size-3.5 shrink-0 text-white/45" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
WorkflowSelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const WorkflowSelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex h-7 cursor-default items-center justify-center text-white/55",
      className,
    )}
    {...props}
  >
    <ChevronUp className="size-3.5" />
  </SelectPrimitive.ScrollUpButton>
));
WorkflowSelectScrollUpButton.displayName =
  SelectPrimitive.ScrollUpButton.displayName;

const WorkflowSelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex h-7 cursor-default items-center justify-center text-white/55",
      className,
    )}
    {...props}
  >
    <ChevronDown className="size-3.5" />
  </SelectPrimitive.ScrollDownButton>
));
WorkflowSelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName;

export const WorkflowSelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(
  (
    { className, children, position = "popper", sideOffset = 4, ...props },
    ref,
  ) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        sideOffset={sideOffset}
        className={cn(
          "canvas-theme-portal z-[5200] max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-white/10 bg-[#242424] text-[#f7f7f7] shadow-[0_12px_32px_rgba(0,0,0,0.42)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      >
        <WorkflowSelectScrollUpButton />
        <SelectPrimitive.Viewport className="max-h-[280px] p-1">
          {children}
        </SelectPrimitive.Viewport>
        <WorkflowSelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  ),
);
WorkflowSelectContent.displayName = SelectPrimitive.Content.displayName;

export const WorkflowSelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex h-8 min-w-0 cursor-default select-none items-center rounded-md py-1 pl-8 pr-3 text-[13px] text-white/78 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-35 focus:bg-white/10 focus:text-white",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>
      <span className="block min-w-0 truncate">{children}</span>
    </SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
WorkflowSelectItem.displayName = SelectPrimitive.Item.displayName;
