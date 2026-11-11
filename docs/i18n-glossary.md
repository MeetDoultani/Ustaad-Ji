# Ustaad-Ji (उस्ताद जी) — Internationalization & Translation Glossary

This document serves as the authoritative translation guide for **Ustaad-Ji**. It establishes standard Devanagari terminology for traditional Indian barbershop and salon operations, ensuring consistent, conversational, and culturally respectful tone across all user interfaces.

---

## 1. Core Terminology Table

| Concept / UI String | English (en) | Hindi (hi) | Why this choice / Context |
| :--- | :--- | :--- | :--- |
| **Product Brand** | Ustaad-Ji | उस्ताद जी | The respectful, culturally resonant honorific used across India for master craftspeople and master barbers. |
| **Product Tagline** | No more waiting in line. Book your slot. | अब लाइन में नहीं, स्लॉट में | Clear, punchy, conversational Hindi directly addressing the customer pain point of queueing. |
| **Salon / Parlour** | Salon | सैलून | Universally understood across urban and semi-urban India; natural loanword in Devanagari. |
| **Barber / Stylist** | Barber | उस्ताद | "उस्ताद" evokes authentic skill and mastery across people-facing screens. "नाई" is reserved solely for marketing copy. |
| **Customer** | Customer | ग्राहक | Polite, standard Hindi term for client or customer. |
| **Owner** | Salon Owner / Owner | सैलून मालिक / मालिक | Clear and direct designation for parlour proprietor. |
| **Admin** | Admin Desk | एडमिन डेस्क | Professional administrative console title. |
| **Time Slot** | Slot | स्लॉट | "स्लॉट" is widely understood by smartphone users across India; avoids confusing multi-word phrases. |
| **Digital Token** | Token Slip / Token | टोकन पर्ची / टोकन | Evokes the physical paper token slip from traditional Indian counter services. |
| **Booking / Appointment** | Appointment / Booking | अपॉइंटमेंट / बुकिंग | Accepted colloquial loanwords that prevent stiff Sanskritised bureaucratic translations. |
| **Rate Card** | Rate Card | रेट कार्ड | Clear, transparent menu of services with fixed prices. |
| **Pick a Time** | Pick a time | समय चुनें | Clear, approachable label for slot picker. |
| **Customer Reviews** | Customer Reviews | ग्राहकों की राय | Natural and respectful customer feedback label. |
| **Manage Salons** | Manage Salons | सैलून प्रबंध | Administrative salons section. |
| **Manage Barbers** | Manage Barbers | उस्ताद प्रबंध | Administrative barbers section. |
| **Confirm** | Confirm | पक्का करें / पक्का | "पक्का" carries strong cultural assurance and certainty. |
| **Cancel** | Cancel Booking | बुकिंग रद्द करें | Standard, clear term for cancellation without ambiguity. |
| **Reschedule** | Reschedule | समय बदलें | Straightforward and easily understood: "change time". |
| **Upcoming** | Upcoming Appointments | आने वाले अपॉइंटमेंट | Warm, natural phrasing for scheduled future visits. |
| **Completed** | Completed / Done | पूरा | Rubber-stamp status badge indicating a finished haircut/service. |
| **Checked In** | Checked In | पहुँच गए | Customer arrived at the salon counter. |
| **In Progress** | In the Chair / In Progress | कुर्सी पर | Customer currently seated in the barber chair. |
| **No Show** | No-show | नहीं आए | Customer failed to arrive for their slot. |
| **Walk-in** | Walk-in | सीधे आए ग्राहक | Customer arriving directly at the salon counter without advance online booking. |
| **Cancelled by Salon** | Cancelled by the salon | सैलून द्वारा रद्द | Clear reason for salon-initiated cancellations. |
| **Pending** | Pending | इंतज़ार | Friendly status badge on tokens / staff verifications. |
| **Free / Available** | Available | खाली / उपलब्ध | "खाली" is colloquial salon terminology for a barber whose chair is ready. |
| **Busy** | Busy | व्यस्त | Clear status badge for a barber currently serving another customer. |
| **Haircut** | Haircut | बाल कटाई | Everyday standard term used at neighbourhood parlours. |
| **Beard Styling** | Beard Trim & Styling | दाढ़ी कटिंग व स्टाइलिंग | Clear distinction between beard trimming and a straight-razor shave. |
| **Shave** | Shave | शेविंग / हजामत | Familiar terminology for classic wet razor service. |
| **Facial & Cleansing** | Facial & Cleansing | फ़ेशियल व क्लीन-अप | Standard parlance across Indian grooming salons. |
| **Head Massage** | Head Massage | सिर मालिश (चम्पी) | Resonant, deeply traditional Indian grooming tradition ("champi"). |
| **Home Visit** | Home Visit | घर पर सेवा | Direct, unmistakable translation for doorstep grooming. |
| **Language Preference** | Language | भाषा प्राथमिकता | Clean profile settings label. |
| **Rate Card & Services** | Rate Card & Services | रेट कार्ड व सेवाएँ | Staff dashboard services and rates catalog. |
| **Opening Hours** | Opening Hours | खुलने का समय | Weekly salon operating schedule. |
| **Working Hours** | Working Hours | काम का समय | Barber chair availability shifts. |
| **Time Off** | Time Off | छुट्टी | Barber scheduled leaves and breaks. |
| **Closed** | Closed | बंद | Indicator for non-operational weekday. |
| **Hidden** | Hidden | छिपा हुआ | Soft-deleted / inactive service state. |
| **Save** | Save | सहेजें | Form submission action. |
| **Active & Visible** | Active & Visible | सक्रिय व दृश्य | Active service toggle state. |
| **Move Up / Down** | Move Up / Move Down | ऊपर करें / नीचे करें | Service ordering controls. |
| **Reactivate** | Reactivate | पुनः सक्रिय करें | Reactivate hidden service. |
| **Copy to All Days** | Copy to All Days | सभी दिनों पर लागू करें | Multi-day schedule helper. |
| **Schedule Conflict Notice** | Schedule Conflicts Notice | शेड्यूल टकराव की सूचना | Non-blocking schedule collision banner. |

---

## 2. Formatting & Number Rules

1. **Latin Digits Only (`-u-nu-latn`):**
   - In both English and Hindi modes, all numbers, prices, durations, phone numbers, OTPs, dates, and times MUST be displayed in standard Latin numerals (`0, 1, 2, ... 9`).
   - Devanagari numerals (`०, १, २, ... ९`) are strictly avoided for financial and token clarity.
2. **Indian Rupee Symbol (`₹`):**
   - The currency symbol `₹` precedes numeric prices without a space (e.g., `₹150`, `₹400`).
3. **No Mixed Bilingual Slash Strings:**
   - Slash combinations like `Salons Dekhein / सैलून देखें` or `Ghar Wapas / Home` are strictly prohibited in the UI.
   - When in English, render English only. When in Hindi, render Devanagari Hindi only.
4. **Devanagari Typography:**
   - No unnatural letter-spacing (`tracking-wider`, `tracking-tight`) is applied to Devanagari text, ensuring natural ligature shaping.
5. **Standardized Nukta & Chandrabindu Forms:**
   - Always use standard nukta spellings: `फ़ोन`, `अंग्रेज़ी`, `इंतज़ार`, `प्रोफ़ाइल`, `ज़रूर`.
   - Always use standard chandrabindu spellings: `पाएँ`, `सेवाएँ`, `जाँच`, `कहीं`.
