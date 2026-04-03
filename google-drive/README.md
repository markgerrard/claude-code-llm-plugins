# Google Drive Plugin for Claude Code

Upload, download, list, search, and manage files on Google Drive from Claude Code.

## Commands

| Command | Description |
|---------|-------------|
| `/gdrive:setup` | Check configuration and connectivity |
| `/gdrive:auth` | Run OAuth authentication flow |
| `/gdrive:list` | List files in Drive |
| `/gdrive:search` | Search files by name or content |
| `/gdrive:upload` | Upload a local file to Drive |
| `/gdrive:download` | Download a Drive file locally |
| `/gdrive:mkdir` | Create a folder |
| `/gdrive:trash` | Move a file to trash |

## Setup

### 1. Create OAuth credentials

Go to https://console.cloud.google.com/apis/credentials and create an OAuth 2.0 Client ID (Desktop app). Enable the Google Drive API.

### 2. Set credentials

Create `~/.gdrive/.env`:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

### 3. Authenticate

```
/gdrive:auth          # if you have a browser
/gdrive:auth --manual # on headless servers
```

This saves a token to `~/.gdrive/token.json`.

## Usage

```
/gdrive:list                                    # list root files
/gdrive:search "quarterly report"               # search by name/content
/gdrive:upload ./report.pdf                     # upload to root
/gdrive:upload ./report.pdf --folder <folder-id> # upload to folder
/gdrive:download <file-id> ./local-copy.pdf     # download
/gdrive:mkdir "Project Files"                   # create folder
/gdrive:trash <file-id>                         # trash a file
```

### Natural language

- "Upload the test report to Drive"
- "Find the quarterly report on Drive"
- "Download that spreadsheet"
- "Create a folder called Backups on Drive"

## Dependencies

Requires `googleapis` npm package. Install in the plugin directory:

```bash
cd google-drive && npm install googleapis
```

## Part of [cc-plugins](https://github.com/markgerrard/cc-plugins)

Install with all other plugins: `./install.sh` or standalone: `./install.sh gdrive`
