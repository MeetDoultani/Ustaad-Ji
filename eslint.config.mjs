import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: true,
          allowedStrings: [
            " ",
            ", ",
            " • ",
            " →",
            "← ",
            " •",
            " / ",
            "•",
            "→",
            "←",
            "✓",
            "✕",
            "⚡",
            "₹",
            "m",
            "h",
            "+",
            "-",
            "!",
            ":",
            "/",
            "✂️",
            "📍",
            "⏰",
            "⏳",
            "📞",
            "🖨️",
            "💈",
            "⭐",
            "👤",
            "⚠️",
            "⚠",
            "💡",
            "🔄",
            "📖",
            "🎫",
            "ℹ️",
            "★",
            "✂",
            "✦",
            "—",
            "–",
            "&ldquo;",
            "&rdquo;",
            "&bull; #",
            "#",
            "*",
            "/200",
            "m)",
            "(",
            ")",
            "(₹",
            "• ₹",
            ".",
            "&",
            "+91",
            "01",
            "02",
            "03",
            "Ustaad-Ji",
          ],
          ignoreProps: true,
          noAttributeStrings: false,
        },
      ],
    },
  },
];

export default eslintConfig;
