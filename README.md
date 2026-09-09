# Hextech Ledger

A scoreboard, round timer and pairings display for Riftbound nights, built to run
on the TV at the shop. It handles 1v1 and 2v2, official events and casual ones.

> This used to be called **Magma Chamber**. Same app, new name. If you already
> had it running, everything you saved — your archive, your shop logo, your TV
> text size — comes across on its own the first time you open it.

Everything below is written in plain English. There is no account to make.
It runs on a **Mac** or on **Windows** — follow whichever setup section matches
the computer you are using. After that, the rest of the guide is the same for
both.

---

## One time only — Mac

*(On Windows? Skip to the next section.)*

### 1. Get the folder onto the Mac

On this page, click the green **Code** button, then **Download ZIP**.

Open your **Downloads** folder and double-click the ZIP. That makes a normal
folder. (Its name still says `magma-chamber` — that was the old name for this,
and renaming the download would break the link. The app inside is the right one.)

Drag that folder onto your **Desktop** so it is easy to find.

### 2. Let the Mac run it

Because you downloaded this from the internet, macOS wants you to confirm it once.

Open the folder. Find the file called:

**`Hextech Ledger (macOS).command`**

**Right-click it** (or hold Control and click), then choose **Open**.

A warning box appears. Click **Open** again.

> You only do the right-click step once. Every time after this, a normal
> double-click works.

If instead you get a message about *permission denied*, see
**"If something goes wrong"** at the bottom.

Nothing needs installing on a Mac — everything it needs is already there.

---

## One time only — Windows

*(On a Mac? Use the section above instead.)*

### 1. Install Node.js

Unlike a Mac, Windows does not come with the piece this app needs to run, so you
install it once. It is free and takes a couple of minutes.

Go to **https://nodejs.org** and click the big green **LTS** button. Run the file
it downloads and click **Next** through the installer, leaving every setting the
way it comes.

You never have to open Node.js or think about it again — the app uses it in the
background.

> On a shop computer that locks things down, you may need whoever looks after it
> to install this for you.

### 2. Get the folder onto the PC

On this page, click the green **Code** button, then **Download ZIP**.

Open your **Downloads** folder, right-click the ZIP, choose **Extract All**, then
**Extract**. That makes a normal folder. (Its name still says `magma-chamber` — that was the old name for this,
and renaming the download would break the link. The app inside is the right one.)

Drag that folder onto your **Desktop** so it is easy to find.

### 3. Let Windows run it

Open the folder and find the file called:

**`Hextech Ledger (Windows).bat`**

Double-click it.

The first time, Windows may show a blue box saying **"Windows protected your
PC"**. Click the small **More info** text, then the **Run anyway** button that
appears.

> You only do that step once.

---

## Putting your shop's name on it

Do this once, the first time you open the app. It sticks after that, including
between events — you will not have to set it again.

Click **Shop settings** on the first screen the app shows you — or open the
**Settings** tab once you are inside. Find **Shop branding** and pick one of the
two:

**Shop name** — type your shop's name in the box underneath. It appears on the TV
above the Hextech Ledger name.

**Logo image** — click **Choose logo image…** and pick a picture file from your
computer. PNG, JPG and SVG all work.

Don't worry about the size of the picture. Whatever you give it gets resized to
fit the space on the TV, so a huge photo and a small icon both come out looking
right. A logo with a see-through background stays see-through.

A preview appears under the buttons showing roughly how it will look on the TV.
To go back, click **Remove logo**, or just switch back to **Shop name**.

> Skip this entirely and the TV simply shows *Hextech Ledger* on its own. Nothing
> breaks.

The **Settings** tab is also where the rest of the one-off shop stuff lives: how
many tables you have, how long the pairings stay up on the TV before it flips to
the leaderboard, and the backup buttons.

### Where your files get saved

By default, anything the app saves — the backup it makes at the end of each
night, and any spreadsheet you export — goes to your **Downloads** folder like
any other download.

If you would rather keep them together, open **Settings → Where files are saved**
and click **Choose folder…**. Pick any folder you like and everything lands there
from then on. It remembers the folder, but your browser will ask you to confirm
it once each time you start the app up — that is the browser being careful, not
something going wrong. Click **Allow**.

**Use Downloads** puts it back to normal.

> This needs **Chrome** or **Edge**. In other browsers the button will tell you
> so, and files keep going to Downloads.

---

## Every event night

### 1. Start it

Double-click the launcher in the folder:

- On a Mac — **`Hextech Ledger (macOS).command`**
- On Windows — **`Hextech Ledger (Windows).bat`**

A black text window opens. That is normal, it is the app running.
**Leave that window open.** Closing it turns the app off.

Your web browser opens automatically to the app.

### 2. Put the scoreboard on the TV

In the app, click **Open TV Display**.

A second window opens. Drag that window onto the TV, then make it fill the whole
screen:

- On a Mac — press **Control + Command + F**
- On Windows — press **F11**

Leave the first window on the laptop. That is the one you type into.

### 3. Pick the kind of night

The app asks first: **1v1** or **2v2**. Click one.

That choice is the whole setup. The app only shows you the tabs and settings that
kind of night actually needs, so there is nothing extra to ignore.

- **1v1** — the Riftbound page runs it, the app shows it. See below.
- **2v2** — the app runs it. See below.

You only pick once; it remembers. To change later, go to **Setup** and use the
**Switch to 1v1** / **Switch to 2v2** button at the bottom.

**Running a 1v1 that isn't on the Riftbound page?** Tick the **Manual 1v1** box
under the two choices first. That tells the app there is no event to read from,
so it runs the whole thing itself — pairings, table numbers, results and points.
Use it for casual side events and anything you are not putting on the Riftbound
page. You can tick or untick it later on the **Setup** tab, but doing that clears
the round you are in the middle of, so it asks first.

> 2v2 has no such box, because the app runs those pairings either way.

### 4. Run the night

Follow whichever section below matches what you picked, then at the end of the
night use **Setup → Finish & archive event**.

### 5. Shut down

Close the black text window. That's it.

---

## 1v1 nights — just show the Riftbound page

For Nexus Nights, skirmishes and store events, everything already happens on the
Riftbound event page. It makes the pairings, and players report their own results
on their phones.

For those nights the app doesn't need to do any of that. It just puts the
pairings, the standings and a big clock on the TV.

Pick **1v1** when the app asks.

1. On the **Setup** tab, put the event ID in and click **Import signups** once.
   That is how the app knows which event you are running.
2. Go to the **Round** tab. The pairings and table numbers appear and go straight
   up on the TV.
3. Press **Start timer** for the round clock.

When the next round is paired, click **Refresh from UVS**. The app also checks by
itself every half a minute, so results show up without you touching anything.

You don't make teams and you don't type in any scores. The standings on the TV are
the ones the Riftbound page is already keeping.

> **Nothing is ever sent to the Riftbound page.** The app only reads it, so you
> cannot break your event from in here.

### An unofficial 1v1 night

If you ticked **Manual**, there is no Riftbound event to read from, so the app
runs it instead. Add the players by hand on **Setup**, then **Generate pairings**
on the Round tab — each player is paired against another, given a table, and you
tap the winner and type the points the same way a 2v2 night works. A **Standings**
tab appears for the leaderboard.

---

## 2v2 nights — the app runs it

The Riftbound page has no way to run a 2v2 match, so for team nights the app does
the work: pairings, table numbers, results and points.

Pick **2v2** when the app asks.

1. **Setup** — put the event ID in and click **Import signups** to pull in
   everyone who signed up. You can also add players by hand.
2. **Teams** — put the players into pairs.
3. **Round** — **Generate pairings**, then **Start timer**. Tap the winning team,
   then type both teams' points.
4. **Finish round & continue** when the round is done.

### Reporting a 2v2 night

Set the event up as **multiplayer unpaired**. That skips pairings entirely and
just takes a win or a loss for each player, which is exactly what a 2v2 night
produces — and it means **nobody has to be dropped from the event**, so everyone's
match data still gets recorded.

Between rounds, open the **Results** tab. It lists every player **in alphabetical
order** with their own win or loss, so you can go straight down the list without
hunting for names. Both players on a team get their team's result, and a bye
counts as a win for both.

Anything not finished yet says **not reported** rather than showing a loss, so you
can see at a glance what is still outstanding.

**Copy as text** puts the whole list on your clipboard if you would rather paste
it somewhere.

---

## The Stats tab

Two halves, with a switch at the top.

### Events

Every night you have finished and archived, newest first. **Click one to open
it** and you get:

- the **top 8** for that night, and
- the **legend meta for that night** — a ring showing the split of domains
  people brought, and a bar for each legend showing how many people played it.

Meta is kept per night on purpose. What people brought last Tuesday is a real
thing; averaging it with three months of other nights is not.

### Players

A running record for everyone who has ever played at your shop: matches won and
lost, win rate, how many nights they have turned up to, how many they have won,
and the legends they bring. The bar beside each name is how many matches they
have played, with the filled part being the share they won.

It fills in by itself — every time you use **Finish & archive event**, that
night's results get added to everyone's record. Both players on a 2v2 team get
the team's result.

Nights you never finish and archive don't count, and neither do 1v1 nights the
Riftbound page was running, since it keeps those results rather than the app.

**Export player records (CSV)** saves the whole table as a spreadsheet.

---

## Overtime

On the **Setup** tab there is **Overtime after time is called**. Set it to how
many extra minutes you give tables still playing when time runs out.

When the round clock reaches zero, instead of just stopping, it turns **red** and
counts the overtime down. Leave it at `0` if you don't use overtime and the clock
behaves exactly as it did before.

---

## Making the text bigger or smaller on the TV

Click on the TV window once, then press the **+** or **−** key.
Press **0** to put it back to normal.

The computer remembers this, so you only need to do it once.

---

## If something goes wrong

**The black window says "Node.js was not found" (Windows)**

Step 1 of the Windows setup was skipped, or did not finish. Install it from
**https://nodejs.org** using the green **LTS** button, then restart the computer
and double-click the launcher again.

**Windows shows a blue "Windows protected your PC" box**

Click **More info**, then **Run anyway**. Windows shows this for anything
downloaded from the internet, and it only asks once.

**"Permission denied" when you double-click (Mac)**

The file lost a setting when it was unzipped. Fix it once:

1. Open **Terminal** (press Command + Space, type `Terminal`, press Return).
2. Type this exactly, including the space at the end:
   ```
   chmod +x 
   ```
3. Drag the `Hextech Ledger (macOS).command` file into the Terminal window.
   It fills in the location for you.
4. Press **Return**. Nothing appears to happen — that means it worked.
5. Go back and double-click the file again.

**The page says it can't connect**

The black text window probably got closed. Double-click the launcher again.

**"Import signups" says it can't find the event**

Check that you used only the number from the web address, with no extra
characters. Also make sure the computer is on the internet.

**I picked the wrong kind of night**

Go to **Setup** and use **Switch to the other kind of night** at the bottom. It
asks first, because switching clears the round in progress — the two run too
differently to carry one over.

**There's no Teams or Results tab**

You are set up for a **1v1** night, which doesn't use them. Switch to 2v2 on the
Setup tab if that's wrong.

**There's no "Generate pairings" button**

The Riftbound page is making the pairings for this night, so the app won't make
its own. If this is an unofficial night that isn't on the Riftbound page, tick
**Manual 1v1** on the Setup tab and the button comes back.

**The app keeps asking to use my folder**

Browsers make a page re-confirm folder access each time they start up. Click
**Allow** and it will not ask again until next time you open the app. If you
would rather not be asked, use **Settings → Use Downloads**.

**A night shows no legend meta**

Nobody had a legend set on the Setup tab that night. Legends are optional, and
the ring only draws what was actually recorded.

**Someone's missing from Player records**

Only nights you finished with **Finish & archive event** are counted, and 1v1
nights run from the Riftbound page aren't counted at all. A player also has to be
spelled the same way each night to be recognised as the same person.

**The Results tab says "not reported" for someone**

That match hasn't been finished in the app yet. Go to the **Round** tab, tap the
winning team and enter both teams' points, and the Results tab will fill in.

**The browser didn't open by itself**

Open your browser and type this into the address bar:

```
localhost:8080
```

Use `localhost`, not anything else — the import feature depends on it.

**Nothing works and you need it running now**

Everything except *Import signups* works without the internet. You can add
players by hand on the Setup tab and run the whole night that way.
