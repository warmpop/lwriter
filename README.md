# lwriter

a calm, distraction-free writing app for windows & mac. free and open source.

your words live in plain markdown files on your own disk. no accounts,
no cloud, no toolbars, no telemetry. just typography and a blinking caret.

<p align="center">
  <a href="https://github.com/warmpop/lwriter/releases/download/a0.3/lwriter_a0.3-setup-x64.exe"><img alt="Download for Windows" src="https://img.shields.io/badge/windows-download-FFECB8?style=for-the-badge&logo=windows&logoColor=FFECB8&labelColor=2c2410"></a>
  &nbsp;
  <a href="https://github.com/warmpop/lwriter/releases/download/a0.3/lwriter_a0.2-silicon.dmg"><img alt="Download for macOS" src="https://img.shields.io/badge/macOS-download-FFECB8?style=for-the-badge&logo=apple&logoColor=FFECB8&labelColor=2c2410"></a>
  &nbsp;
  <a href="BUILD.md"><img alt="Linux (Untested)" src="https://img.shields.io/badge/linux-build%20from%20source-FFECB8?style=for-the-badge&logo=linux&logoColor=FFECB8&labelColor=2c2410"></a>
</p>

## what it does

- markdown, styled live. headings, bold, italic, code and quotes take
  shape as you type, and syntax characters fade to a whisper
- typewriter mode (ctrl+t). the current line stays vertically centered
- focus mode (ctrl+shift+f). everything but the current paragraph dims
- notes sidebar (ctrl+d). plain .md files in Documents\lwriter, with
  rename, move, archive, and delete from a context menu
- obsidian-friendly. link a vault and edit it in place as a real folder
  tree, nothing converted, nothing locked in
- images. paste or drop a picture and it's saved beside the note,
  embedded ![[like this]], rendered in preview
- find & replace (ctrl+f / ctrl+h). live highlights, one-undo replace-all
- preview & export (ctrl+e / ctrl+shift+e). serif reading view and
  standalone self-contained html export
- light & dark. follows the windows theme live, or pin either one
- your type. jetbrains mono & ia writer quattro bundled, plus any installed
  or custom font
- small. native rust (tauri 2), about 2 mb installer, no electron
- discord rich presence (optional, off by default). an elapsed-time
  clock and a rotating status line, never your document's name or contents

## install:

premade builds for windows and mac are in the [releases tab](https://github.com/warmpop/lwriter/releases/latest). (note: the macOS build is several versions behind Windows and is largely untested. please report any issues you may have!)

linux users can build and install it using the instructions in [BUILD.md](BUILD.md).

### uninstalling / resetting your data:

lwriter never touches anything outside two places: your notes, and its own
settings. removing the app itself doesn't remove either, so do that on purpose:

- your notes are plain .md files and are never deleted by an uninstall.
  they live in Documents/lwriter, plus wherever you've linked a vault.
  delete that folder yourself if you want them gone.
- settings & session (theme, fonts, window state, no writing) live
  separately from your notes:
  - windows: %LOCALAPPDATA%\app.lwriter
  - mac: ~/Library/WebKit/app.lwriter (and ~/Library/Application Support/app.lwriter
    if present), delete both for a full reset

## known issues:

macOS: 
* CMD+H to hide the program instead opens search+find
* topbar elements not ligning up with traffic lights & other visual inconsistencies
  
*(both issues will be resolved in r1.0)*

### report bugs & give feedback please!
if you run into any problems, please [make a big issue](https://github.com/warmpop/lwriter/issues/new) out of it! remember include your OS and lwriter version number in the issue! - feel free to also use the issues tab for suggestions! all thoughts are appreciated. 

## license:

[MIT](LICENSE) - 
all bundled fonts (JetBrains Mono, iA Writer Quattro S) are used under the SIL Open Font License.

this project was heavily inspired & influenced by [write0](https://write.omarbadri.dev/) & [iA Writer](https://ia.net/writer) - special thanks to both pieces of software. give write0 a try if you're looking for a good focused web app alternative.
