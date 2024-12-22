const St = imports.gi.St;
const Desklet = imports.ui.desklet;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const Gio = imports.gi.Gio;
const UUID = "cinamodoro@software-by-design";
const DESKLET_DIR = imports.ui.deskletManager.deskletMeta[UUID].path;
const Main = imports.ui.main;

class PomodoroDesklet extends Desklet.Desklet {
    constructor(metadata, desklet_id) {
        super(metadata, desklet_id);

        this._container = new St.BoxLayout({ vertical: true, style_class: "main-container" });
        this._timerContainer = new St.BoxLayout({ style_class: "timer_container" });
        this._controlsContainer = new St.BoxLayout({ style_class: "controls_container" });

        // Timer display
        this._timeLabel = new St.Label({ style_class: "time_label" });
        this._stateLabel = new St.Label({ style_class: "state_label" });

        // Control buttons
        this._startButton = new St.Button({
            style_class: "button",
            child: new St.Label({ text: "Start" })
        });
        this._resetButton = new St.Button({
            style_class: "button",
            child: new St.Label({ text: "Reset" })
        });

        // Initialize timer state
        this.isRunning = false;
        this.isWorkTime = true;
        this.timeRemaining = 0;
        this.pomodoroCycles = 0; // Track completed Pomodoro cycles
        this.timerLoop = null;

        // Bind settings
        this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], desklet_id);
        this.settings.bind("work-duration", "workDuration", this._onSettingsChanged);
        this.settings.bind("break-duration", "breakDuration", this._onSettingsChanged);
        this.settings.bind("long-break-duration", "longBreakDuration", this._onSettingsChanged);
        this.settings.bind("cycles-before-long-break", "cyclesBeforeLongBreak", this._onSettingsChanged);
        this.settings.bind("font-size", "fontSize", this._onSettingsChanged);
        this.settings.bind("text-color", "textColor", this._onSettingsChanged);
        this.settings.bind("background-color", "bgColor", this._onSettingsChanged);
        this.settings.bind("play-sound", "playSound", null);
        this.settings.bind("auto-start-next-timer", "autoStartNextTimer", null);
        this.settings.bind("show-notifications", "showNotifications", null); // New setting for notifications

        // Build UI
        this._buildLayout();
        this._connectSignals();
        this._resetTimer();
    }

    _buildLayout() {
        this._timerContainer.add(this._timeLabel);
        this._timerContainer.add(this._stateLabel);

        this._controlsContainer.add(this._startButton);
        this._controlsContainer.add(this._resetButton);

        this._container.add(this._timerContainer);
        this._container.add(this._controlsContainer);

        this.setContent(this._container);
        this.setHeader(_("Cinamodoro - a pomodoro timer"));
    }

    _connectSignals() {
        this._startButton.connect('clicked', Lang.bind(this, this._toggleTimer));
        this._resetButton.connect('clicked', Lang.bind(this, this._resetTimer));
    }

    _toggleTimer() {
        if (!this.isRunning && this.timeRemaining === 0 && !this.autoStartNextTimer) {
            // If the timer has ended and autoStartNextTimer is false, set to continue
            this._continueTimer();
            this._startButton.child.set_text("Pause");
        } else if (!this.isRunning) {
            this._startTimer();
            this._startButton.child.set_text("Pause");
        } else if (this.isRunning) {
            this._pauseTimer();
            this._startButton.child.set_text("Start");
        }
    }

    _startTimer() {
        if (this.timerLoop) {
            Mainloop.source_remove(this.timerLoop);
        }
        this.timerLoop = Mainloop.timeout_add_seconds(1, Lang.bind(this, this._updateTimer));
        this.isRunning = true;
    }

    _pauseTimer() {
        if (this.isRunning) {
            this._showAlert("Timer paused!");
            Mainloop.source_remove(this.timerLoop);
            this.timerLoop = null;
            this.isRunning = false; // Update the isRunning state to false
        }
    }

    _resetTimer() {
        this._pauseTimer();
        this.isRunning = false;
        this.isWorkTime = true; // Reset to work time when resetting
        this.pomodoroCycles = 0; // Reset cycle count
        this.timeRemaining = this.workDuration * 60; // Reset to work duration
        this._startButton.child.set_text("Start");
        this._updateDisplay();
    }

    _updateTimer() {
        if (this.timeRemaining > 0) {
            this.timeRemaining--;
            this._updateDisplay();
            return true;
        } else {
            this._onTimerComplete();
            return false;
        }
    }

    _updateDisplay() {
        let minutes = Math.floor(this.timeRemaining / 60);
        let seconds = this.timeRemaining % 60;
        this._timeLabel.set_text(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        this._stateLabel.set_text(this.isWorkTime ? "Work Time" : "Break Time");
    }

    _onTimerComplete() {
        this._playNotificationSound();

        this.isWorkTime = !this.isWorkTime;

        // Increment cycle count only when transitioning from work to break
        if (!this.isWorkTime) {
            this.pomodoroCycles++; // Increment cycle count on work time
        }

        // Check if it's time for a long break
        if (!this.isWorkTime && this.pomodoroCycles >= this.cyclesBeforeLongBreak) {
            this.timeRemaining = this.longBreakDuration * 60;
            this.pomodoroCycles = 0; // Reset cycle count after long break
            this._showAlert("Well done! Time for a long break!");
        } else {
            this.timeRemaining = this.isWorkTime ?
                this.workDuration * 60 :
                this.breakDuration * 60;

            if (this.isWorkTime) {
                this._showAlert("Break time over - get back to work!");
            } else {
                this._showAlert("It's break time - kick back and relax!");
            }
        }

        // Check if auto-start is enabled
        if (this.autoStartNextTimer) {
            this._startTimer(); // Ensure the timer starts again
        } else {
            this._startButton.child.set_text("Continue");
            this._startButton.show();
        }
    }

    _playNotificationSound() {
        if (this.playSound) {
            let soundFile = Gio.File.new_for_path(DESKLET_DIR + "/sounds/cashier.ogg");

            if (this.isWorkTime) {
                soundFile = Gio.File.new_for_path(DESKLET_DIR + "/sounds/cashier.ogg");
            } else {
                soundFile = Gio.File.new_for_path(DESKLET_DIR + "/sounds/schoolBell.ogg");
            }

            let player = global.display.get_sound_player();

            // Error handling for sound playback
            if (player) {
                player.play_from_file(soundFile, "", null);
            } else {
                this._showAlert("Sound player is not available.");
            }
        }
    }

    _onSettingsChanged() {
        console.log("Text Color:", this.textColor);
        console.log("Background Color:", this.bgColor);

        this._timeLabel.style = `
            font-size: ${this.fontSize}px;
            color: ${this.textColor};
        `;
        this._stateLabel.style = `
            font-size: ${this.fontSize * 0.5}px;
            color: ${this.textColor};
        `;
        this._container.style = `background-color: ${this.bgColor};`;

        // Update button text color
        this._startButton.child.set_style(`color: ${this.textColor};`);
        this._resetButton.child.set_style(`color: ${this.textColor};`);

        if (!this.isRunning) {
            this._resetTimer();
        }
    }

    on_desklet_removed() {
        this._pauseTimer();
    }

    _continueTimer() {
        this._showAlert("Pomodoro cycle completed!");
        this._startTimer();
        this._startButton.child.set_text("Pause");
    }

    _showAlert(message) {
        if (this.showNotifications) {
            Main.notify("Pomodoro Timer", message);
        }
    }
}

function main(metadata, desklet_id) {
    return new PomodoroDesklet(metadata, desklet_id);
}
