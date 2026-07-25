"use client"

import * as React from "react"
import { CheckIcon, ChevronsUpDown } from "lucide-react"
import * as RPNInput from "react-phone-number-input"
import flags from "react-phone-number-input/flags"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

type PhoneInputProps = Omit<
  React.ComponentProps<"input">,
  "onChange" | "value" | "ref"
> &
  Omit<RPNInput.Props<typeof RPNInput.default>, "onChange"> & {
    onChange?: (value: RPNInput.Value) => void
  }

/** International phone input: country flag + calling code picked
 * separately from the national number, formatted and validated via
 * libphonenumber-js — outputs E.164 (e.g. "+442079460123"), the exact
 * format Duffel's API expects. */
const PhoneInput: React.ForwardRefExoticComponent<PhoneInputProps> =
  React.forwardRef<React.ElementRef<typeof RPNInput.default>, PhoneInputProps>(
    ({ className, onChange, value, ...props }, ref) => {
      return (
        <RPNInput.default
          ref={ref}
          className={cn("flex", className)}
          flagComponent={FlagComponent}
          countrySelectComponent={CountrySelect}
          inputComponent={InputComponent}
          smartCaret={false}
          value={value || undefined}
          /**
           * react-phone-number-input fires onChange with `undefined` when
           * the field is emptied — coerce to "" so it plays nicely with
           * react-hook-form / zod, which expect a string.
           */
          onChange={(value) => onChange?.(value || ("" as RPNInput.Value))}
          {...props}
        />
      )
    },
  )
PhoneInput.displayName = "PhoneInput"

const InputComponent = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(({ className, ...props }, ref) => (
  <Input
    className={cn("min-w-0 flex-1 rounded-e-lg rounded-s-none", className)}
    {...props}
    ref={ref}
  />
))
InputComponent.displayName = "InputComponent"

type CountryEntry = { label: string; value: RPNInput.Country | undefined }

type CountrySelectProps = {
  disabled?: boolean
  value: RPNInput.Country
  options: CountryEntry[]
  onChange: (country: RPNInput.Country) => void
}

function CountrySelect({
  disabled,
  value: selectedCountry,
  options: countryList,
  onChange,
}: CountrySelectProps) {
  const scrollAreaRef = React.useRef<HTMLDivElement>(null)
  const [searchValue, setSearchValue] = React.useState("")
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <Popover
      open={isOpen}
      modal
      onOpenChange={(open) => {
        setIsOpen(open)
        if (open) setSearchValue("")
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="flex shrink-0 gap-1.5 rounded-e-none rounded-s-lg border-r-0 px-3 focus:z-10"
            disabled={disabled}
          />
        }
      >
        <FlagComponent country={selectedCountry} countryName={selectedCountry} />
        {selectedCountry && (
          <span className="text-sm text-foreground/70">
            {`+${RPNInput.getCountryCallingCode(selectedCountry)}`}
          </span>
        )}
        <ChevronsUpDown
          className={cn("-mr-2 size-4 opacity-50", disabled ? "hidden" : "opacity-100")}
        />
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={searchValue}
            onValueChange={(value) => {
              setSearchValue(value)
              setTimeout(() => {
                const viewport = scrollAreaRef.current?.querySelector(
                  "[data-slot=scroll-area-viewport]",
                )
                if (viewport) viewport.scrollTop = 0
              }, 0)
            }}
            placeholder="Search country..."
          />
          <CommandList>
            <ScrollArea ref={scrollAreaRef} className="h-72">
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {countryList
                  .filter(({ value, label }) => {
                    if (!value) return false
                    if (!searchValue) return true
                    return label.toLowerCase().includes(searchValue.toLowerCase())
                  })
                  .map(({ value, label }) =>
                    value ? (
                      <CountrySelectOption
                        key={value}
                        country={value}
                        countryName={label}
                        selectedCountry={selectedCountry}
                        onChange={onChange}
                        onSelectComplete={() => setIsOpen(false)}
                      />
                    ) : null,
                  )}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

interface CountrySelectOptionProps {
  country: RPNInput.Country
  countryName: string
  selectedCountry: RPNInput.Country
  onChange: (country: RPNInput.Country) => void
  onSelectComplete: () => void
}

function CountrySelectOption({
  country,
  countryName,
  selectedCountry,
  onChange,
  onSelectComplete,
}: CountrySelectOptionProps) {
  function handleSelect() {
    onChange(country)
    onSelectComplete()
  }

  return (
    <CommandItem className="gap-2" onSelect={handleSelect}>
      <FlagComponent country={country} countryName={countryName} />
      <span className="flex-1 text-sm">{countryName}</span>
      <span className="text-sm text-foreground/50">
        {`+${RPNInput.getCountryCallingCode(country)}`}
      </span>
      <CheckIcon
        className={cn("ml-auto size-4", country === selectedCountry ? "opacity-100" : "opacity-0")}
      />
    </CommandItem>
  )
}

function FlagComponent({ country, countryName }: RPNInput.FlagProps) {
  const Flag = flags[country]

  return (
    <span className="flex h-4 w-6 overflow-hidden rounded-sm bg-foreground/20 [&_svg:not([class*='size-'])]:size-full">
      {Flag && <Flag title={countryName} />}
    </span>
  )
}

export { PhoneInput }
