# 11. DESIGN BRIEF (mandatory)

Goal: the site should feel like walking into a real Indian neighbourhood salon, not like a SaaS template. Every screen should use at least one salon-world element (rate board, token, diary, tiles, mirror frame, barber pole).

### 1. Design principles
1. **Salon-world metaphors, not decoration.** The price list is a painted board, the confirmation is a paper token, the slot picker is the appointment diary. Each metaphor must also be usable.
2. **Warm and busy, but organised.** Real salons are colourful and crowded; the UI can be rich as long as the layout stays clean and the main action is obvious.
3. **Mobile first.** Most users are on phones, often on slow data. Design at 360px wide first; tap targets at least 44px.
4. **Bilingual by default.** Hindi (Devanagari) beside English in headings, buttons and key labels. Add a language toggle later for more regional languages.
5. **Plain language, Hinglish tone.** Friendly, local, never corporate.

### 2. Colour palette
Define these as design tokens (CSS variables / Tailwind theme). Do not introduce purple, blue-purple gradients or neon.

| Token | Hex | Use |
| --- | --- | --- |
| `tile` | `#8FD0BC` | Wall-tile mint; section backgrounds, tile pattern |
| `teal-deep` | `#0F5E57` | Headers, primary dark surfaces |
| `paper` | `#F6EBD0` | Page background, token slips (aged paper) |
| `ink` | `#2B2118` | Body text on paper |
| `marigold` | `#F2A900` | Primary buttons, highlights |
| `saffron` | `#E8731A` | Secondary accent, hover states |
| `maroon` | `#7A1F2B` | Signboard frames, headings on paper |
| `steel` | `#8A9299` | Borders, chair and tool icons, disabled states |
| `pole-red` | `#C8262F` | Barber-pole stripe, alerts |
| `pole-blue` | `#1E4F9C` | Barber-pole stripe only; use sparingly |
| `chalk` | `#FFFFFF` | Pole stripe, card highlights |

Rules: body text is always `ink` on `paper` (or white on `teal-deep`). Marigold buttons use `ink` text, not white. No gradients except subtle paper-grain texture.

### 3. Typography
| Role | Font | Notes |
| --- | --- | --- |
| Signboard headings | **Yatra One** | Supports Devanagari and Latin; looks hand-painted. Use for H1/H2 and the logo. |
| Body text | **Hind** | Clean, supports Devanagari. 16px minimum. |
| Buttons and labels | **Baloo 2** | Rounded, friendly, bold. |
| Token numbers and prices | **Special Elite** (typewriter) | Paper-token and receipt feel. |

Pair every English heading with a Hindi line, e.g. "Book Your Slot" / "अपना समय बुक करें", the Hindi slightly smaller beneath it. Load fonts with `next/font` and subset to Latin + Devanagari.

### 4. Signature components

#### 4.1 Signboard header
Maroon painted-board header with a thin marigold border and the salon name in Yatra One. A small barber pole icon beside the logo. On scroll it shrinks to a slim bar; keep the pole visible.

#### 4.2 Rate card board (price list)
- Dark teal board with a wooden or maroon frame and slight chalk-texture.
- Each row: service name (English + Hindi), dotted leader line, price in ₹ in the typewriter font.
- Group under hand-lettered subheads: बाल / Hair, दाढ़ी / Beard, फेशियल / Facial, Head Massage, Home Visit.
- Each row has a small "Book" tap target; the row highlights marigold when selected.
- Never render this as a standard pricing table or card grid.

#### 4.3 Token slip (booking confirmation)
- Cream paper rectangle with perforated left and right edges (CSS radial-gradient mask), slightly rotated (about -1.5deg).
- Big token number ("Token No. 14") in the typewriter font, then salon, barber, service, date and time.
- A circular maroon "CONFIRMED / पक्का" rubber stamp overlapping the corner.
- Entry animation: slides down as if torn from a roll. Provide a "Save as image" button and a WhatsApp share.

#### 4.4 Register diary slot picker
- Ruled notebook page with red margin line and a spiral or stitched binding down the left.
- Time slots written as lines in the diary; available slots in ink, booked slots struck through with a pen line, selected slot circled in marigold.
- Day tabs styled as diary page tabs (Aaj / आज, Kal / कल, then dates).
- Slot length follows the chosen service duration.

#### 4.5 Barber cards ("Ustaad" cards)
- Photo inside an ornate mirror-style frame (maroon and gold CSS border, rounded top corners).
- Name, years of experience, specialities, rating, and an "Available now / Next free at 4:30" label.
- Use only barber-supplied or illustrated photos, never stock film-star imagery.

#### 4.6 Live queue board (phase 7)
Small digital "Now serving" display styled like a shop counter display: red seven-segment digits for the current token, "People waiting" and "Approx. wait" below. Reuse this on the salon page and the owner dashboard.

#### 4.7 Dividers and backgrounds
- Section divider: horizontal barber-pole stripe (red, white, blue) with a diagonal repeating gradient, animated slowly or static on reduced-motion.
- Background: subtle mint tile pattern (CSS grid with 1px grout lines) behind hero and footer; paper texture for content areas.
- Optional truck-art style floral border on the landing page hero, drawn as SVG, not a photo.

#### 4.8 Buttons
- Primary: marigold fill, 2px ink border, small hard offset shadow (like a printed sticker), Baloo 2 text. Pressed state sinks the shadow.
- Secondary: paper fill with maroon border.
- Destructive: pole-red fill.
- Disabled: steel text on paper.

### 5. Pages and key content
1. **Home:** hero with signboard headline ("Ab line mein nahi, slot mein / अब लाइन में नहीं, स्लॉट में"), search by area or salon, three steps (choose salon, pick slot, get token), featured salons as mirror-frame cards.
2. **Salon list:** filter chips (Hair, Beard, Home Visit, Open now), cards with price-from, rating and a live "waiting" badge later.
3. **Salon page:** signboard header, ustaad cards, rate card board, diary slot picker, reviews styled as pinned slips.
4. **Booking flow:** service(s) from the rate card, barber, diary slot, phone OTP (if logged out), review, token.
5. **My bookings:** token slips stacked like a spike file; cancel and reschedule actions.
6. **Auth:** phone number, OTP boxes styled as token digits, role selector for barbers and owners.
7. **Barber / owner dashboard:** today's list as a register, big "Next customer" button, walk-in token button, service and hours editor. Large touch targets; works one-handed.
8. **Admin:** plain, functional tables are fine here; apply the palette and fonts only.

### 6. Microcopy (Hinglish tone)
| Moment | Text |
| --- | --- |
| Booking confirmed | "Aapka number: 14. Dhanyavaad!" / "आपका नंबर: 14" |
| Slot taken | "Yeh slot bhar gaya hai, doosra chuniye." |
| Empty bookings | "Abhi koi booking nahi. Pehla slot book karein?" |
| Wait info | "Aapse pehle 3 log hain, lagbhag 25 minute." |
| OTP sent | "OTP bhej diya gaya hai." |
| Error | "Kuch gadbad ho gayi. Dobara try karein." |

### 7. Motion
- Token slide-down on confirmation, diary page-turn between days, slow barber-pole stripe movement.
- Keep animations under 400ms and respect `prefers-reduced-motion`.

### 8. Accessibility and performance
- Text contrast at least 4.5:1; check marigold and mint backgrounds with ink text.
- Never rely on colour alone for slot status; booked slots are also struck through.
- Optimise images (WebP, lazy load); target under 200KB for the first screen on mobile data.
- Support the system font scale up to 130% without breaking layouts.

### 9. Do not
- No purple or blue-purple gradients, glassmorphism or generic rounded white card grids.
- No default system fonts or Inter/Roboto as the look.
- No stock-photo hero of a generic modern salon.
- No film-star posters or copyrighted imagery; use original illustration or the salons' own photos.
- No standard pricing table for services; always use the rate card board.

### 10. Tailwind tokens (starter)
```ts
// tailwind.config.ts (extend theme)
colors: {
  tile: '#8FD0BC',
  tealDeep: '#0F5E57',
  paper: '#F6EBD0',
  ink: '#2B2118',
  marigold: '#F2A900',
  saffron: '#E8731A',
  maroon: '#7A1F2B',
  steel: '#8A9299',
  poleRed: '#C8262F',
  poleBlue: '#1E4F9C',
  chalk: '#FFFFFF',
},
fontFamily: {
  sign: ['var(--font-sign)', 'serif'],
  body: ['var(--font-body)', 'sans-serif'],
  label: ['var(--font-label)', 'sans-serif'],
  token: ['var(--font-token)', 'monospace'],
},
```
