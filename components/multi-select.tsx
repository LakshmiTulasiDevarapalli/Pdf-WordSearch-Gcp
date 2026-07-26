"use client"

import { useState } from "react"
import { Check, ChevronDown, X } from "lucide-react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface MultiSelectProps {
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
}

const VISIBLE_BADGE_LIMIT = 12

export function MultiSelect({ options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleSelect = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option))
    } else {
      onChange([...selected, option])
    }
  }

  const handleRemove = (option: string) => {
    onChange(selected.filter((s) => s !== option))
  }

  const handleSelectAll = () => {
    if (selected.length === options.length) {
      // If all selected, deselect all
      onChange([])
    } else {
      // Otherwise, select all
      onChange([...options])
    }
  }

  const allSelected = selected.length === options.length && options.length > 0

  return (
    <div className="space-y-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            style={{
              width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"10px 14px", borderRadius:"8px", border:"1px solid rgba(201,168,76,0.3)",
              background:"rgba(255,255,255,0.8)", cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif", fontSize:"13px", color:"#6b7280",
            }}
          >
            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:"13px",color:"#6b7280"}}>
              {selected.length === 0
                ? "Select keywords..."
                : `${selected.length} keyword${selected.length !== 1 ? "s" : ""} selected`}
            </span>
            <ChevronDown style={{width:"16px",height:"16px",opacity:0.5,flexShrink:0}}/>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Search keywords..." />
            <CommandList>
              <CommandEmpty>No keywords found.</CommandEmpty>
              <CommandGroup className="max-h-64 overflow-auto">
                <CommandItem onSelect={handleSelectAll} className="font-semibold">
                  <Check className={cn("mr-2 size-4", allSelected ? "opacity-100" : "opacity-0")} />
                  <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:"13px",fontWeight:700}}>Select All</span>
                </CommandItem>
                <CommandSeparator className="my-1" />
                {options.map((option) => (
                  <CommandItem key={option} value={option} onSelect={() => handleSelect(option)}>
                    <Check className={cn("mr-2 size-4", selected.includes(option) ? "opacity-100" : "opacity-0")} />
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:"13px"}}>{option}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="space-y-2">
          <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
            {(expanded ? selected : selected.slice(0, VISIBLE_BADGE_LIMIT)).map((option) => (
              <span key={option} style={{
                display:"inline-flex",alignItems:"center",gap:"5px",
                fontFamily:"'DM Sans',sans-serif",fontSize:"12px",fontWeight:600,
                color:"#374151",background:"rgba(26,46,110,0.07)",
                border:"1px solid rgba(26,46,110,0.12)",
                borderRadius:"6px",padding:"3px 8px",
              }}>
                {option}
                <button type="button" onClick={() => handleRemove(option)}
                  style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",color:"#9ca3af",lineHeight:1}}>
                  <X style={{width:"11px",height:"11px"}}/>
                </button>
              </span>
            ))}
          </div>
          {selected.length > VISIBLE_BADGE_LIMIT && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              style={{
                fontFamily:"'DM Sans',sans-serif",fontSize:"12px",fontWeight:600,
                color:"#4c1d95",background:"none",border:"none",cursor:"pointer",
                padding:0,display:"flex",alignItems:"center",gap:"4px",
              }}
            >
              {expanded ? "Show less" : `+${selected.length - VISIBLE_BADGE_LIMIT} more`}
              <ChevronDown style={{width:"12px",height:"12px",transform: expanded ? "rotate(180deg)" : "none",transition:"transform .15s"}}/>
            </button>
          )}
        </div>
      )}
    </div>
  )
}