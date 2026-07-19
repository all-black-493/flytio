"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const labelClass =
  "font-mono text-[11px] tracking-widest text-muted-foreground";

export default function SearchCard() {
  return (
    <Card id="search" className="overflow-hidden py-0 gap-0 shadow-xl">
      <div className="flex items-center justify-between bg-board px-5 py-3 sm:px-6">
        <span className="font-mono text-[11px] tracking-[0.25em] text-board-muted">
          FLIGHT SEARCH
        </span>
        <span className="font-mono text-[11px] tracking-[0.25em] text-signal">
          COUNTER 01
        </span>
      </div>
      <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <div className="grid gap-1.5">
          <Label htmlFor="from" className={labelClass}>
            FROM
          </Label>
          <Input id="from" defaultValue="OSL — Oslo" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to" className={labelClass}>
            TO
          </Label>
          <Input id="to" defaultValue="JFK — New York" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="depart" className={labelClass}>
            DEPART
          </Label>
          <Input id="depart" type="date" defaultValue="2026-08-14" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="return" className={labelClass}>
            RETURN
          </Label>
          <Input id="return" type="date" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="passengers" className={labelClass}>
            PASSENGERS
          </Label>
          <Select defaultValue="1 adult">
            <SelectTrigger id="passengers" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1 adult">1 adult</SelectItem>
              <SelectItem value="2 adults">2 adults</SelectItem>
              <SelectItem value="Family (4)">Family (4)</SelectItem>
              <SelectItem value="Team (10+)">Team (10+)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2 border-t border-dashed pt-4">
          <Button
            render={<a href="#board" />}
            size="lg"
            className="w-full font-semibold"
          >
            Search flights
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
