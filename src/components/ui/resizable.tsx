"use client"

import * as React from "react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) {
  return (
    <ResizablePrimitive.PanelGroup
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

// A draggable divider is only a feature if it can be found. Four deliberate
// choices, all of them quiet at rest (T084):
//
// 1. The element keeps `w-px`, so the layout gains no gutter and a resting
//    divider is the same 1px `line` hairline the shell border used to be.
//    `after:` widens the *pointer* target to 10px, and the library adds 5px
//    (fine pointer) / 15px (coarse) around that.
// 2. Hovering the widened corridor strengthens the hairline to `line-strong`
//    (the library reports it as `data-resize-handle-state="hover"`).
// 3. While dragging - by pointer or from the keyboard - the hairline and the
//    grip turn signal-coloured via `data-resize-handle-active`. Hover alone is
//    not enough here: a fast drag outruns the hover state.
// 4. `tabIndex` is set because a `role="separator"` that cannot take focus
//    cannot be resized from the keyboard; the library already handles
//    Arrow/Home/End/F6 once focus lands on it.
function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.PanelResizeHandle
      data-slot="resizable-handle"
      tabIndex={0}
      aria-label="Resize panels"
      className={cn(
        "group/handle relative flex w-px shrink-0 items-center justify-center bg-line transition-colors duration-150",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-2.5 after:-translate-x-1/2",
        "data-[resize-handle-state=hover]:bg-line-strong",
        "data-[resize-handle-active]:bg-signal",
        "focus-visible:bg-signal focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
        "data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full",
        "data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-2.5 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2",
        "[&[data-panel-group-direction=vertical]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-5 w-1 shrink-0 items-center justify-center rounded-full bg-line-strong transition-[height,background-color] duration-150 group-hover/handle:h-8 group-hover/handle:bg-signal group-data-[resize-handle-active]/handle:h-8 group-data-[resize-handle-active]/handle:bg-signal" />
      )}
    </ResizablePrimitive.PanelResizeHandle>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
