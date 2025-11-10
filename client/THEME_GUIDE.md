# Walrus Storage - Theme Guide

## Color Palette

### Primary Colors
```css
--primary: 200 100% 45%        /* Ocean Blue - Main brand color */
--accent: 188 94% 43%          /* Cyan - Accent highlights */
```

### Gradients
```css
/* Background Gradients */
from-cyan-50 via-blue-50 to-indigo-100  /* Light mode background */
from-slate-950 via-slate-900 to-slate-800  /* Dark mode background */

/* Button Gradients */
from-cyan-500 to-blue-600      /* Primary actions */
from-cyan-600 to-blue-600      /* Hover states */
from-green-500 to-emerald-500  /* Success states */
from-amber-500 to-orange-500   /* Warning states */
```

### Semantic Colors
```css
--success: Green (Encryption enabled, uploads complete)
--warning: Amber (Encryption disabled)
--error: Red (Upload failures, download errors)
--info: Blue (General information)
```

## Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 
             'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 
             'Helvetica Neue', sans-serif;
```

### Font Sizes
- **Headings**: 
  - H1: `text-xl` (20px) - Header title
  - H2: `text-2xl` (24px) - Card titles
  - H3: `text-lg` (18px) - Section headers
- **Body**: `text-sm` (14px) - Default text
- **Small**: `text-xs` (12px) - Metadata, timestamps
- **Monospace**: Blob IDs, technical data

## Spacing System

### Padding
- Cards: `p-6` (24px)
- Buttons: `px-4 py-2` (16px/8px)
- Sections: `space-y-6` (24px gap)

### Margins
- Page margins: `max-w-7xl mx-auto`
- Section gaps: `gap-6` (24px)

## Component Patterns

### Cards
```tsx
<Card className="border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30">
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Icon className="h-6 w-6 text-cyan-600" />
      Title
    </CardTitle>
    <CardDescription>Description text</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

### Buttons
```tsx
{/* Primary Action */}
<Button className="bg-gradient-to-r from-cyan-600 to-blue-600">
  <Icon className="mr-2 h-4 w-4" />
  Action
</Button>

{/* Secondary Action */}
<Button variant="outline" className="border-blue-300">
  <Icon className="mr-2 h-4 w-4" />
  Action
</Button>
```

### Status Badges
```tsx
{/* Encrypted Badge */}
<span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
  <Lock className="h-3 w-3" />
  Encrypted
</span>
```

## Icons

### Lucide React Icons Used
- `Waves` - Brand/logo
- `Upload`, `FileUp` - Upload actions
- `Download` - Download actions
- `Lock`, `LockOpen` - Encryption states
- `Shield` - Raw download
- `FileText` - File/history
- `Calendar` - Timestamps
- `HardDrive` - Storage
- `Trash2` - Delete/cancel
- `CheckCircle` - Success
- `XCircle` - Error
- `Loader2` - Loading (with spin animation)

## Animation Classes

### Custom Animations
```css
.animate-fade-in {
  animation: fadeIn 0.3s ease-in;
}

.animate-slide-up {
  animation: slideUp 0.4s ease-out;
}
```

### Usage
- Page transitions: `animate-fade-in`
- Toasts/notifications: `animate-slide-up`
- Hover effects: `transition-all hover:scale-110`
- Progress bars: `transition-all duration-300`

## Dark Mode

### Activation
Automatically follows system preference via `dark:` prefix

### Dark Mode Colors
```css
dark:from-slate-950 dark:via-slate-900 dark:to-slate-800  /* Background */
dark:border-slate-700                                      /* Borders */
dark:bg-slate-800                                          /* Cards */
dark:text-gray-100                                         /* Text */
dark:text-cyan-400                                         /* Accents */
```

## Accessibility

### Focus States
```css
focus:outline-none focus:ring-2 focus:ring-cyan-500/20
focus:border-cyan-500
```

### Color Contrast
- All text meets WCAG AA standards
- Interactive elements have clear hover/focus states
- Disabled states use 50% opacity

### Semantic HTML
- Proper heading hierarchy
- ARIA labels where needed
- Keyboard navigation support

## Best Practices

1. **Use the theme colors** - Don't introduce new colors
2. **Maintain spacing consistency** - Use Tailwind's spacing scale
3. **Add hover states** - All interactive elements should respond to hover
4. **Include loading states** - Show spinners during async operations
5. **Provide feedback** - Use toasts/messages for user actions
6. **Support dark mode** - Always include dark: variants
7. **Use gradients sparingly** - Reserve for primary actions and backgrounds
8. **Icon consistency** - Always pair icons with text labels
