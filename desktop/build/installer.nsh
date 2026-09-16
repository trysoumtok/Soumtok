; Soumtok branded NSIS (electron-builder include)

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Install Soumtok"
  !define MUI_WELCOMEPAGE_TEXT "Setup will install Soumtok Desktop on your computer.$\r$\n$\r$\nSoumtok is the AI-native IDE: agent, Tab completions, terminal, git, and extensions.$\r$\n$\r$\nClick Next to continue."
!macroend

!macro customLicensePage
  !define MUI_LICENSEPAGE_TEXT_TOP "Please review the Soumtok End User License Agreement before installing."
  !define MUI_LICENSEPAGE_TEXT_BOTTOM "If you accept the terms, click I Agree to continue. You must accept to install Soumtok."
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "Soumtok is ready"
  !define MUI_FINISHPAGE_TEXT "Soumtok has been installed successfully.$\r$\n$\r$\nOpen a folder and start coding with the agent."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "Launch Soumtok"
!macroend

!macro customInstallMode
  StrCpy $isForceMachineInstall "0"
!macroend
