"use client"

import { Card } from "@/components/ui/card"
import { TrendingUpIcon, UsersIcon, DollarSignIcon, ActivityIcon } from "lucide-react"

export function StatsHeader() {
  const stats = [
    {
      label: "Total Value Locked",
      value: "$2.4M",
      change: "+12.5%",
      icon: DollarSignIcon,
      positive: true,
    },
    {
      label: "Active Strategies",
      value: "24",
      change: "+3",
      icon: ActivityIcon,
      positive: true,
    },
    {
      label: "Total LPs",
      value: "1,247",
      change: "+89",
      icon: UsersIcon,
      positive: true,
    },
    {
      label: "Avg. APY",
      value: "14.3%",
      change: "+2.1%",
      icon: TrendingUpIcon,
      positive: true,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon
        return (
          <Card key={index} className="border-primary/20 bg-card/50 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="size-4" />
                {stat.label}
              </div>
              <span className={`text-xs font-medium ${stat.positive ? "text-primary" : "text-destructive"}`}>
                {stat.change}
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">{stat.value}</div>
          </Card>
        )
      })}
    </div>
  )
}
