# Alternative Screenshot Layouts

## Option 1: Current 2x2 Grid (Already Added)
```markdown
<table>
  <tr>
    <td width="50%">
      <img src="screenshots/homepage.png" alt="Homepage" />
      <p align="center"><b>Homepage</b></p>
    </td>
    <td width="50%">
      <img src="screenshots/local-library.png" alt="Local Library" />
      <p align="center"><b>Local Library</b></p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="screenshots/anilist-library.png" alt="AniList Library" />
      <p align="center"><b>AniList Library</b></p>
    </td>
    <td width="50%">
      <img src="screenshots/settings.png" alt="Settings" />
      <p align="center"><b>Settings</b></p>
    </td>
  </tr>
</table>
```

## Option 2: Single Column (Vertical Stack)
```markdown
### Homepage - Continue Watching
![Homepage](screenshots/homepage.png)

### Local Library - Browse Your Collection
![Local Library](screenshots/local-library.png)

### AniList Library - Sync Your List
![AniList Library](screenshots/anilist-library.png)

### Notifications & Settings
![Settings](screenshots/settings.png)
```

## Option 3: Horizontal Row
```markdown
| Homepage | Local Library | AniList Library | Settings |
|----------|---------------|-----------------|----------|
| ![Homepage](screenshots/homepage.png) | ![Local Library](screenshots/local-library.png) | ![AniList](screenshots/anilist-library.png) | ![Settings](screenshots/settings.png) |
```

## Option 4: Collapsible Details (Expandable)
```markdown
<details>
<summary>📸 Click to view screenshots</summary>

### Homepage
![Homepage](screenshots/homepage.png)

### Local Library
![Local Library](screenshots/local-library.png)

### AniList Library
![AniList Library](screenshots/anilist-library.png)

### Settings
![Settings](screenshots/settings.png)

</details>
```

## Option 5: Badges with Links (No images shown initially)
```markdown
[![Homepage](https://img.shields.io/badge/View-Homepage-blue)](screenshots/homepage.png)
[![Local Library](https://img.shields.io/badge/View-Local_Library-green)](screenshots/local-library.png)
[![AniList](https://img.shields.io/badge/View-AniList_Library-orange)](screenshots/anilist-library.png)
[![Settings](https://img.shields.io/badge/View-Settings-purple)](screenshots/settings.png)
```

## Current Layout: 2x2 Grid ✅

The README currently uses the 2x2 grid layout. To change it, edit the README.md file and replace the `<table>` section with any of the alternatives above.
