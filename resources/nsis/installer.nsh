# Custom NSIS include for the EpicWallet installer and uninstaller (electron-builder nsis.include).
#
# electron-builder puts this file in the script header of BOTH builds: the installer and the
# uninstaller, which is compiled first as a separate script with BUILD_UNINSTALLER defined.
# makensis runs with -WX, so a function or variable that one of the two builds never uses is a
# build error. That is why everything below sits in a macro or behind !ifdef BUILD_UNINSTALLER.
#
# 1. Uninstaller option "Also remove app settings (wallets are never removed)", unchecked.
#    It removes ONLY the app's own settings and caches, never a wallet:
#      %APPDATA%\epic-desktop-wallet              Electron profile 6.x (address book, settings)
#      %APPDATA%\EpicWallet                       Electron profile up to 5.3.1
#      %LOCALAPPDATA%\epic-desktop-wallet-updater updater cache 6.x
#      %LOCALAPPDATA%\epicwallet-updater          updater cache up to 5.3.1 (and 3.0.1)
#      %USERPROFILE%\.epic\epic_3-0-0_config.json the wallet list
#      %USERPROFILE%\.epic\gui_processes.json     processes started by the app (6.1)
#      %USERPROFILE%\.epic\log\????_??_*.log      the app's own log files (YYYY_MM_D[.old].log),
#                                                 then the log folder only if it is now empty
#    Nothing else under %USERPROFILE%\.epic is touched and nothing there is removed recursively:
#    wallets live in %USERPROFILE%\.epic\<account>\<main|floo|user> (an account may even be
#    called "log") or in a folder the user picked.
#    It never runs in a silent uninstall (/S) or an update (--updated, /KEEP_APP_DATA): those are
#    how the installer and auto-update remove the previous version.
#
#    6.1: its root is %USERPROFILE%\.epic-gui (may be moved, see its location.json). This branch
#    deletes nothing there. The 6.1 branch may add exactly <root>\app (its Chromium profile),
#    <root>\logs and <root>\gui_processes.json; it must never delete <root>\wallets, <root>\node
#    (chain data), <root>\settings.json(.bak) (the wallet list), <root>\location.json or the root
#    itself. tests/nsisInstaller.test.js enforces the never-list.
#
# 2. Installer: remove the leftover Apps & Features entry of GUI 3.0.1. It was built with appId
#    "epic.tech", so its entry has another GUID and survives the upgrade. Its uninstaller would
#    delete the shared install folder and the shortcuts, which 6.x uses too, so it is never run:
#    only its registry entries are removed, and only where it collides with this install.

!include LogicLib.nsh
!include FileFunc.nsh

# electron-builder: UUID v5 of appId "epic.tech" in namespace 50e065bc-3134-11e6-9bab-38c9862bdaf3
!define EPIC_OLD_APPID_GUID "2fde87fb-9fe9-5ca6-bb40-4478d1e6f36e"
!define EPIC_OLD_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${EPIC_OLD_APPID_GUID}"
!define EPIC_OLD_INSTALL_KEY "Software\${EPIC_OLD_APPID_GUID}"

!if "${APP_GUID}" == "${EPIC_OLD_APPID_GUID}"
  !error "appId is epic.tech again: the 3.0.1 cleanup would delete this app's own registry entries"
!endif

# the folder names below are fixed on purpose (5.x name kept); a rename must update them
!if "${APP_PACKAGE_NAME}" != "epic-desktop-wallet"
  !error "package.json name changed: update the userData and updater folders in resources/nsis/installer.nsh"
!endif

!ifdef BUILD_UNINSTALLER
  # the components page has no description box (installer.nsi sets MUI_COMPONENTSPAGE_NODESC)
  !define MUI_COMPONENTSPAGE_TEXT_TOP "Your wallets are never removed: wallet folders, seeds and chain data stay on disk. App settings are the wallet list, address book and logs. If you remove them, open your wallets again after a reinstall with $\"Select existing wallet data location$\"."
!endif

!macro customUnInstallSection
  Section /o "un.Also remove app settings (wallets are never removed)" epicRemoveAppSettingsSection
    Push $R0
    Push $R1
    StrCpy $R1 "1"

    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "/KEEP_APP_DATA" $R0
    ${IfNot} ${Errors}
      StrCpy $R1 "0"
    ${EndIf}
    ClearErrors

    ${If} ${Silent}
    ${OrIf} ${isUpdated}
      StrCpy $R1 "0"
    ${EndIf}

    # second chance, with room for the full text (No is the default and the silent answer)
    ${If} $R1 == "1"
      ${IfNot} ${Cmd} `MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Remove the EpicWallet app settings?$\r$\n$\r$\nRemoved: the wallet list, the address book and other settings, update caches and the app's log files.$\r$\n$\r$\nKept: all wallets (wallet folders, seeds, chain data), in %USERPROFILE%\.epic and in any folder you picked.$\r$\n$\r$\nAfter a reinstall, open each wallet again with $\"Select existing wallet data location$\"." /SD IDNO IDYES`
        StrCpy $R1 "0"
      ${EndIf}
    ${EndIf}

    ${If} $R1 == "1"
      # electron keeps userData per user: in a per-machine uninstall the elevated inner instance may
      # run as another (admin) account, so delete from the outer instance, the user who started it
      ${If} ${UAC_IsInnerInstance}
        !insertmacro UAC_AsUser_Call Function un.epicRemoveAppSettings ${UAC_SYNCREGISTERS}
      ${Else}
        Call un.epicRemoveAppSettings
      ${EndIf}
    ${Else}
      DetailPrint "App settings kept"
    ${EndIf}

    Pop $R1
    Pop $R0
  SectionEnd

  # The complete delete list. Exact paths only; RMDir /r only on the app's own profile and cache
  # folders, never under %USERPROFILE%\.epic.
  Function un.epicRemoveAppSettings
    SetShellVarContext current

    ${If} $APPDATA != ""
      RMDir /r "$APPDATA\epic-desktop-wallet"
      RMDir /r "$APPDATA\EpicWallet"
    ${EndIf}

    ${If} $LOCALAPPDATA != ""
      RMDir /r "$LOCALAPPDATA\epic-desktop-wallet-updater"
      RMDir /r "$LOCALAPPDATA\epicwallet-updater"
    ${EndIf}

    ${If} $PROFILE != ""
      Delete "$PROFILE\.epic\epic_3-0-0_config.json"
      Delete "$PROFILE\.epic\gui_processes.json"
      # files only (Delete skips folders), top level only; the folder goes only if now empty
      Delete "$PROFILE\.epic\log\????_??_*.log"
      RMDir "$PROFILE\.epic\log"
    ${EndIf}

    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
    DetailPrint "App settings removed; wallets kept"
  FunctionEnd
!macroend

# ---- installer: old "epic.tech" (3.0.1) Apps & Features entry ----
#
# 3.0.1's uninstaller (electron-builder 22.14.13) deletes $DESKTOP\EpicWallet.lnk and
# $SMPROGRAMS\EpicWallet.lnk in its own shell context, then RMDir /r its install folder. The
# entry is removed when running it would hurt this install:
#   - same context (HKCU entry and per-user install, HKLM entry and per-machine install): the
#     shortcut names are the same, it would delete ours;
#   - its folder and $INSTDIR are the same or one contains the other: it would delete our files;
#   - its folder can't be found in the registry.
# Otherwise (other context, separate folder) it is a separate install whose uninstaller only
# removes its own files and shortcuts, so it is left alone. Old program files in another folder
# are never deleted here (the registry path is not trusted for a recursive delete); the user is
# told where they are.

!macro epicRemoveOldAppIdEntry ROOT
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  Push $R5
  Push $R6

  ReadRegStr $R0 ${ROOT} "${EPIC_OLD_UNINSTALL_KEY}" "UninstallString"
  ReadRegStr $R1 ${ROOT} "${EPIC_OLD_UNINSTALL_KEY}" "DisplayName"
  ReadRegStr $R2 ${ROOT} "${EPIC_OLD_INSTALL_KEY}" "InstallLocation"
  ClearErrors

  # $R5 = "1" if there is an old entry and it is EpicWallet's (3.0.1 wrote "EpicWallet 3.0.1";
  # a missing name still counts, a foreign name does not)
  StrCpy $R5 "0"
  ${If} $R0 != ""
    StrCpy $R5 "1"
  ${EndIf}
  ${If} $R2 != ""
    StrCpy $R5 "1"
  ${EndIf}
  StrCpy $R3 $R1 10
  ${If} $R1 != ""
  ${AndIf} $R3 != "EpicWallet"
    StrCpy $R5 "0"
  ${EndIf}

  ${If} $R5 == "1"
    ${If} $R1 == ""
      StrCpy $R1 "EpicWallet 3.0.1"
    ${EndIf}
    ${If} $R2 == ""
    ${AndIf} $R0 != ""
      !insertmacro GetInQuotes $R4 "$R0"
      ${If} $R4 != ""
        Push $R4
        Call GetFileParent
        Pop $R2
      ${EndIf}
    ${EndIf}

    # $R3 = "1" if running its uninstaller would hurt this install
    StrCpy $R3 "0"
    !if "${ROOT}" == "HKEY_CURRENT_USER"
      ${If} $installMode == "CurrentUser"
        StrCpy $R3 "1"
      ${EndIf}
    !else
      ${If} $installMode == "all"
        StrCpy $R3 "1"
      ${EndIf}
    !endif

    # strip a trailing backslash, then compare as "dir\" prefixes (StrCmp is case-insensitive)
    StrCpy $R4 "$INSTDIR"
    StrCpy $R5 $R4 1 -1
    ${If} $R5 == "\"
      StrCpy $R4 $R4 -1
    ${EndIf}
    StrCpy $R5 $R2 1 -1
    ${If} $R5 == "\"
      StrCpy $R2 $R2 -1
    ${EndIf}
    StrCpy $R6 "0"
    ${If} $R2 != ""
      StrLen $R5 "$R2\"
      StrCpy $R5 "$R4\" $R5
      ${If} $R5 == "$R2\"
        StrCpy $R6 "1"
      ${EndIf}
      StrLen $R5 "$R4\"
      StrCpy $R5 "$R2\" $R5
      ${If} $R5 == "$R4\"
        StrCpy $R6 "1"
      ${EndIf}
    ${Else}
      # folder unknown: its uninstaller can't be shown to be harmless
      StrCpy $R6 "1"
    ${EndIf}
    ${If} $R6 == "1"
      StrCpy $R3 "1"
    ${EndIf}

    ${If} $R3 == "1"
      DeleteRegKey ${ROOT} "${EPIC_OLD_UNINSTALL_KEY}"
      DeleteRegKey ${ROOT} "${EPIC_OLD_INSTALL_KEY}"
      # check the result, not the error flag (a key that was never there also sets it)
      ReadRegStr $R4 ${ROOT} "${EPIC_OLD_UNINSTALL_KEY}" "UninstallString"
      ReadRegStr $R5 ${ROOT} "${EPIC_OLD_UNINSTALL_KEY}" "DisplayName"
      ${If} $R4 != ""
      ${OrIf} $R5 != ""
        DetailPrint "Could not remove the old EpicWallet 3.0.1 entry (${ROOT})"
        MessageBox MB_OK|MB_ICONEXCLAMATION "The old $R1 is still listed in Apps & Features and could not be removed from the list.$\r$\n$\r$\nDo not uninstall that old entry: it would remove the files or shortcuts of the new EpicWallet. Your wallets are not affected." /SD IDOK
      ${Else}
        DetailPrint "Removed the old EpicWallet 3.0.1 entry (${ROOT})"
        ${If} $R6 == "0"
        ${AndIf} $R2 != ""
        ${AndIf} ${FileExists} "$R2\*.*"
          DetailPrint "Old EpicWallet program files left in $R2"
          MessageBox MB_OK|MB_ICONINFORMATION "The old $R1 was removed from Apps & Features. Its program files are still in:$\r$\n$R2$\r$\n$\r$\nYou can delete that folder yourself. Your wallets are not stored there." /SD IDOK
        ${EndIf}
      ${EndIf}
    ${Else}
      DetailPrint "Separate old EpicWallet install left as is (${ROOT}): $R2"
    ${EndIf}
  ${EndIf}
  ClearErrors

  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend

# runs at the end of the install section (after files and registry), also in silent installs and
# auto-updates: it only removes registry entries
!macro customInstall
  !insertmacro epicRemoveOldAppIdEntry HKEY_CURRENT_USER
  !insertmacro epicRemoveOldAppIdEntry HKEY_LOCAL_MACHINE
!macroend
