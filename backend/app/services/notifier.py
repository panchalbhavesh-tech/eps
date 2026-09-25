import requests
from app.core.config import settings

class DiscordNotifier:
    """
    Service to send formatted stock alerts and catalyst radar updates
    directly to Discord channels via Webhook URLs.
    """
    def __init__(self):
        self.trading_url = settings.DISCORD_TRADING_WEBHOOK_URL
        self.admin_url = settings.DISCORD_ADMIN_WEBHOOK_URL
        self.enabled = settings.DISCORD_ALERTS_ENABLED

    def send_embed(self, embed: dict, is_admin: bool = False) -> bool:
        url = self.admin_url if is_admin else self.trading_url
        if not self.enabled or not url:
            return False
        try:
            payload = {
                "embeds": [embed]
            }
            resp = requests.post(url, json=payload, timeout=10)
            return resp.status_code in (200, 204)
        except Exception as e:
            print(f"Failed to send Discord webhook alert: {e}")
            return False

    def send_momentum_alert(self, ticker: str, comp_score: float, signal: str, price: float, stop_loss: float, reasons: str):
        """Sends momentum signal alert with clean color-coded embed."""
        color = 3066993 if signal == "BUY" else 15158332 if signal == "EXIT" else 16776960 # Green, Red, Yellow
        emoji = "🚀" if signal == "BUY" else "🚨" if signal == "EXIT" else "👀"
        
        embed = {
            "title": f"{emoji} Momentum Signal: {signal}",
            "description": f"Cross-sectional momentum scan generated a new **{signal}** trigger.",
            "color": color,
            "fields": [
                {"name": "📈 Ticker", "value": f"`{ticker}`", "inline": True},
                {"name": "💵 Trigger Price", "value": f"₹{price:.2f}", "inline": True},
                {"name": "🎯 Composite Score", "value": f"{comp_score:.1f}/100", "inline": True},
                {"name": "🛡️ Suggested Stop Loss", "value": f"₹{stop_loss:.2f}", "inline": True},
                {"name": "📝 Attention Triggers / Risk Reasons", "value": reasons if reasons else "Standard Technical Breakout", "inline": False}
            ]
        }
        self.send_embed(embed, is_admin=False)

    def send_catalyst_alert(self, ticker: str, title: str, category: str, impact_score: float, why: str, url: str):
        """Sends high-impact corporate news catalyst alert with rich embed."""
        color = 15158332 if impact_score >= 80 else 3447003 # Red/Orange for high impact, Blue for normal
        
        embed = {
            "title": f"🔥 Catalyst Radar: {ticker}" if impact_score >= 80 else f"⚡ Catalyst Radar: {ticker}",
            "description": f"**Event:** {title}",
            "color": color,
            "fields": [
                {"name": "🏢 Company", "value": f"`{ticker}`", "inline": True},
                {"name": "📊 Category", "value": f"`{category}`", "inline": True},
                {"name": "🎯 Impact Score", "value": f"{impact_score:.1f}/100", "inline": True},
                {"name": "💡 Why it matters", "value": why, "inline": False}
            ]
        }
        if url:
            embed["url"] = url
            
        self.send_embed(embed, is_admin=False)

    def send_cron_alert(self, task_name: str, status: str, details: str = ""):
        """Sends a system administration alert for Cron Job execution results."""
        is_success = status.upper() == "SUCCESS"
        color = 3066993 if is_success else 15158332 # Green if success, Red if failure
        emoji = "✅" if is_success else "❌"
        
        # Truncate details if they are too long (Discord embed limits)
        safe_details = str(details)[:1000] + "..." if len(str(details)) > 1000 else str(details)
        if not safe_details.strip():
            safe_details = "No output provided."
            
        embed = {
            "title": f"{emoji} System Cron: {status.upper()}",
            "description": f"Background job execution report for `{task_name}`",
            "color": color,
            "fields": [
                {"name": "⚙️ Task Name", "value": f"`{task_name}`", "inline": False},
                {"name": "📝 Result / Output", "value": f"```\n{safe_details}\n```", "inline": False}
            ]
        }
        self.send_embed(embed, is_admin=True)
