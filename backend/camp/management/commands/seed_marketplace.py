from django.core.management.base import BaseCommand
from camp.models import CosmeticItem

AVATARS = [
    ("rookie_bot", "🤖 Rookie Bot", 0),
    ("cadet", "🧑‍🚀 Cadet", 100),
    ("coder", "👨‍💻 Coder", 200),
    ("scout", "🥷 Scout", 300),
    ("ai_defender", "🛡 AI Defender", 500),
    ("glitch_entity", "👾 Glitch Entity", 800),
    ("galaxy_traveler", "🌌 Galaxy Traveler", 1200),
    ("neura_champion", "👑 Neura Champion", 1800),
]

THEMES = [
    ("default_light", "☀️ Default Light", 0),
    ("dark", "🌑 Dark", 250),
    ("cyber_blue", "💙 Cyber Blue", 500),
    ("neon_purple", "💜 Neon Purple", 700),
    ("lava_core", "🌋 Lava Core", 900),
    ("frozen", "❄ Frozen", 1000),
    ("matrix", "🌿 Matrix", 1100),
    ("galaxy", "🌌 Galaxy", 1300),
]

VICTORY_EFFECTS = [
    ("star_burst", "✨ Star Burst", 300),
    ("lightning_strike", "⚡ Lightning Strike", 450),
    ("pixel_explosion", "💥 Pixel Explosion", 600),
    ("galaxy_warp", "🌌 Galaxy Warp", 900),
    ("lava_burst", "🔥 Lava Burst", 1200),
]


class Command(BaseCommand):
    help = "Seeds the marketplace with cosmetics."

    def handle(self, *args, **options):
        self.seed_category("avatar", AVATARS)
        self.seed_category("theme", THEMES)
        self.seed_category("victory_effect", VICTORY_EFFECTS)

        self.stdout.write(
            self.style.SUCCESS("✅ Marketplace seeded successfully!")
        )

    def seed_category(self, category, items):
        for order, (key, name, price) in enumerate(items):
            obj, created = CosmeticItem.objects.update_or_create(
                key=key,
                defaults={
                    "category": category,
                    "name": name,
                    "price": price,
                    "order": order,
                },
            )

            if created:
                self.stdout.write(f"➕ Created {name}")
            else:
                self.stdout.write(f"🔄 Updated {name}")