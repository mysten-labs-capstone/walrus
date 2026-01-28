import * as React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm ring-offset-zinc-900 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-400 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:ring-offset-zinc-900 dark:placeholder:text-zinc-400 dark:focus-visible:ring-emerald-400 ${className}`}
      {...props}
    />
  );
}
