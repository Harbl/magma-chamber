# Magma Chamber

A scoreboard, round timer and pairings display for Riftbound 2v2 nights, built to
run on the TV at the shop.

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
folder called `magma-chamber-main`.

Drag that folder onto your **Desktop** so it is easy to find.

### 2. Let the Mac run it

Because you downloaded this from the internet, macOS wants you to confirm it once.

Open the folder. Find the file called:

**`Magma Chamber (macOS).command`**

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
**Extract**. That makes a normal folder called `magma-chamber-main`.

Drag that folder onto your **Desktop** so it is easy to find.

### 3. Let Windows run it

Open the folder and find the file called:

**`Magma Chamber (Windows).bat`**

Double-click it.

The first time, Windows may show a blue box saying **"Windows protected your
PC"**. Click the small **More info** text, then the **Run anyway** button that
appears.

> You only do that step once.

---

## Every event night

### 1. Start it

Double-click the launcher in the folder:

- On a Mac — **`Magma Chamber (macOS).command`**
- On Windows — **`Magma Chamber (Windows).bat`**

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

### 3. Run the night

In the first window:

- **Setup** — type the event name, then paste the event ID and click
  *Import signups*. The event ID is the number at the end of the event's web
  address on the Riftbound locator, like `.../events/`**`254672`**.
- **Teams** — put players into pairs.
- **Round** — click *Generate pairings*, then *Start timer*. Tap the winning
  team, then type both teams' scores.
- When the night is over — **Setup → Finish & archive event**.

### 4. Shut down

Close the black text window. That's it.

---

## Sending results to Carde.io

If the event is being run on Carde.io, the app can pull the pairings from there
and send the results back, so nobody has to type them in twice.

### Connect

1. Open the **Carde.io** tab in the app.
2. In another browser tab, sign in at **dashboard.carde.io**.
3. Open the developer panel — on a Mac press **Option + Command + I**, on Windows
   press **F12** — then click the **Network** heading along the top of it.
4. Click around the Carde.io dashboard until a list of items appears in that
   panel. Click any item whose name starts with **api.carde.io**.
5. Look under **Request Headers** for a line starting with **authorization:
   Bearer**. Copy the long code that comes after the word `Bearer`.
6. Paste it into the Carde.io tab in Magma Chamber and click **Connect**.

> This code expires, so you will need to fetch a new one each event night.
> If the app says *"Token rejected"*, that is all this means — repeat the steps
> above.

### Run the round

1. Choose the store, the game, and tonight's event.
2. Click **Load rounds**, pick the round, then **Show pairings**.
3. The pairings and table numbers appear, and go up on the TV automatically.
4. As each match finishes, click the winning player's name. There are also
   **Draw** and **Double loss** buttons.
5. Each click is sent to Carde.io straight away, and the pairing is marked once
   it has gone through.

**Pair the round in Carde.io first.** The app can only show and report pairings
that already exist there.

### What changes when Carde.io is connected

Carde.io is in charge of pairings, so the app switches its own pairing off:

- **Generate pairings** and **Finish round & continue** stop working, and a note
  appears explaining why. This is deliberate — two different sets of pairings
  would mean results going against the wrong matches.
- The round timer, the teams list and the stats all keep working as normal.
- The TV shows Carde.io's pairings and table numbers.

Click **Disconnect** on the Carde.io tab to go back to the app making its own
pairings.

> Carde.io records **individual players**, not teams. So a 2v2 result is sent as
> a win for each player on the winning side. That matches how the shop reports
> today.

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
3. Drag the `Magma Chamber (macOS).command` file into the Terminal window.
   It fills in the location for you.
4. Press **Return**. Nothing appears to happen — that means it worked.
5. Go back and double-click the file again.

**The page says it can't connect**

The black text window probably got closed. Double-click the launcher again.

**"Import signups" says it can't find the event**

Check that you used only the number from the web address, with no extra
characters. Also make sure the computer is on the internet.

**Carde.io says the token was rejected**

The code expires. Fetch a fresh one using the steps in
**"Sending results to Carde.io"** above.

**Generate pairings is greyed out**

That means Carde.io is connected and in charge of pairings. Use the Carde.io tab,
or click **Disconnect** there if you would rather the app make its own.

**The browser didn't open by itself**

Open your browser and type this into the address bar:

```
localhost:8080
```

Use `localhost`, not anything else — the import feature depends on it.

**Nothing works and you need it running now**

Everything except *Import signups* works without the internet. You can add
players by hand on the Setup tab and run the whole night that way.
