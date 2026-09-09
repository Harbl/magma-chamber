# Magma Chamber — Mac Setup

Plain-English instructions for getting this running on the shop MacBook.
You do not need to install anything. There is no account to make.

---

## One time only

### 1. Get the folder onto the Mac

Go to **https://github.com/Harbl/magma-chamber**

Click the green **Code** button, then **Download ZIP**.

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

---

## Every event night

### 1. Start it

Double-click **`Magma Chamber (macOS).command`**.

A black text window opens. That is normal — it is the app running.
**Leave that window open.** Closing it turns the app off.

Your web browser opens automatically to the app.

### 2. Put the scoreboard on the TV

In the app, click **Open TV Display**.

A second window opens. Drag that window onto the TV, then press
**Control + Command + F** to make it fill the whole screen.

Leave the first window on the MacBook. That is the one you type into.

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

## Making the text bigger or smaller on the TV

Click on the TV window once, then press the **+** or **−** key.
Press **0** to put it back to normal.

The Mac remembers this, so you only need to do it once.

---

## If something goes wrong

**"Permission denied" when you double-click**

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

The black text window probably got closed. Double-click
`Magma Chamber (macOS).command` again.

**"Import signups" says it can't find the event**

Check that you used only the number from the web address, with no extra
characters. Also make sure the Mac is on the internet.

**The browser didn't open by itself**

Open your browser and type this into the address bar:

```
localhost:8080
```

Use `localhost`, not anything else — the import feature depends on it.

**Nothing works and you need it running now**

Everything except *Import signups* works without the internet. You can add
players by hand on the Setup tab and run the whole night that way.
