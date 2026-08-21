; Custom NSIS include — electron-builder auto-detects build/installer.nsh.
; Goal: the one-click installer's file-unpack phase (dominated by the ~177 MB payload.asar,
; which NSIS's progress bar under-accounts for — see electron-builder #7336) should never
; look frozen. We surface a clear "working" status so the user knows it's progressing.

!macro customInit
  ; Runs during installer initialization (before file extraction).
  DetailPrint "Preparing to install XPIA Tools…"
!macroend

!macro customInstall
  ; Runs during the install phase, around the main file extraction. The bulk of the wait is
  ; unpacking the bundled application payload; label it plainly so the progress pause reads as
  ; work-in-progress rather than a hang.
  DetailPrint "Unpacking XPIA Tools application files — this can take up to a minute on first install, please wait…"
!macroend
