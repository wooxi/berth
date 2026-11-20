import * as React from 'react'
import { cn } from '@/lib/utils'

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
}
function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead className={cn('sticky top-0 z-10 bg-card [&_tr]:border-b', className)} {...props} />
}
function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}
function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      className={cn('border-b border-border outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted aria-selected:bg-primary/10', className)}
      {...props}
    />
  )
}
function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return <th className={cn('h-9 px-4 text-left text-xs font-medium text-muted-foreground', className)} {...props} />
}
function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return <td className={cn('px-4 py-2 align-middle', className)} {...props} />
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }
