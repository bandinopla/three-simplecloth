type DownCallback = (x: number, y: number) => void;
type MoveCallback = (x: number, y: number, dx: number, dy: number) => void;
type UpCallback = (x: number, y: number) => void;

const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

class JsonMouseHandler {

    private downCallbacks: DownCallback[] = [];
    private moveCallbacks: MoveCallback[] = [];
    private upCallbacks: UpCallback[] = [];

    private lastX = 0;
    private lastY = 0;
    private isDown = false;

    constructor() {
        if (isTouchDevice) {
            window.addEventListener('touchstart', (e) => this.handleDown(e.touches[0].clientX, e.touches[0].clientY), { passive: false });
            window.addEventListener('touchmove', (e) => {
                e.preventDefault();
                this.handleMove(e.touches[0].clientX, e.touches[0].clientY);
            }, { passive: false });
            window.addEventListener('touchend', (e) => this.handleUp(this.lastX, this.lastY));
            window.addEventListener('touchcancel', (e) => this.handleUp(this.lastX, this.lastY));
        } else {
            window.addEventListener('mousedown', (e) => this.handleDown(e.clientX, e.clientY));
            window.addEventListener('mousemove', (e) => this.handleMove(e.clientX, e.clientY));
            window.addEventListener('mouseup', (e) => this.handleUp(e.clientX, e.clientY));
        }
    }

    private handleDown(x: number, y: number) {
        this.lastX = x;
        this.lastY = y;
        this.isDown = true;
        for (const cb of this.downCallbacks) cb(x, y);
    }

    private handleMove(x: number, y: number) {
        const dx = x - this.lastX;
        const dy = y - this.lastY;
        this.lastX = x;
        this.lastY = y;
        for (const cb of this.moveCallbacks) cb(x, y, dx, dy);
    }

    private handleUp(x: number, y: number) {
        this.isDown = false;
        for (const cb of this.upCallbacks) cb(x, y);
    }

    onMouseDown(cb: DownCallback) {
        this.downCallbacks.push(cb);
        return this;
    }

    onMouseMove(cb: MoveCallback) {
        this.moveCallbacks.push(cb);
        return this;
    }

    onMouseUp(cb: UpCallback) {
        this.upCallbacks.push(cb);
        return this;
    }

    get pressed() {
        return this.isDown;
    }
}

export default new JsonMouseHandler();
