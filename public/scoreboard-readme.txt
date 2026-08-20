XBTesports™ SCOREBOARD

Viewer overlay: /overlay/
Admin control: /admin/

OBS SETUP
1. Add a Browser Source in OBS.
2. Use the full overlay URL from the same xbtesports.hub domain.
3. Set the source width to 640 and height to 420 (or match your canvas).
4. Leave Custom CSS blank. The page outside the scoreboard is transparent.
5. Open /admin/ in a separate browser tab or window while broadcasting.

LIVE OPERATION
Edit gamertags, positions, KD, and visibility in Admin Control, then press SAVE & SYNC. The OBS overlay updates without refreshing. Compact mode shows the top five visible players; Full mode shows all visible players. Use TRIGGER POSITION ALERT for a short on-screen update.

The first version intentionally uses browser localStorage and BroadcastChannel on the same domain. It is manual by design and does not call a Call of Duty API. The centralized data object can later be connected to a hosted data store.
