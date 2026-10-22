# Android app status

The actual Android APK is not built or released yet. All website APK download
buttons are disabled and labelled **Coming soon**. No APK URL or browser-install
action is attached to these buttons.

Android phone visitors see a bottom sheet with **Download Android app** (disabled)
and **Continue on website**. The continue button, close button, outside click or
Escape dismisses it and remembers the website choice in local browser storage.
It appears before onboarding so the two dialogs do not compete for focus. iPhone,
desktop, Android tablet, standalone web-app and static-demo visits do not receive
the automatic prompt. Settings keeps the APK status available after dismissal.
Browser-generated installation prompts are suppressed; website settings and
viewing preferences do not advertise Add to Home Screen or PWA installation.

The existing production account backend supports the future APK: sign into the
same Anime Shuffle account or linked MyAnimeList identity to retrieve saved anime,
reactions and viewing preferences. Link MAL from an existing website account to
use both login methods for that account. The eventual APK still needs its own
build, signing, OAuth-return and physical-device verification before enabling
any download button.

The existing service worker retains only a public offline page. It never caches
account/API/OAuth responses and does not supply an APK. No new database polling
or AI calls are introduced by this invitation.
