import { brandFor, getBrand } from '@/lib/company'

/** The company logo. `on="dark"` for the sidebar/TV board, `on="white"` (default) for forms and printed pages. Pass `name` when there is no signed-in company (the family portal). */
export function BrandLogo({ on = 'white', name, className = 'h-12 w-auto shrink-0' }: { on?: 'white' | 'dark'; name?: string; className?: string }) {
  const b = name ? brandFor(name) : getBrand()
  const dark = on === 'dark'
  return (
    <img
      src={dark ? b.logoOnDark : b.logoOnWhite}
      alt={b.displayName}
      className={`${className} ${dark && b.invert ? 'brightness-0 invert opacity-90' : ''}`}
    />
  )
}
