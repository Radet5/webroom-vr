import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import { RoomManager } from "./components/room-manager/room-manager";

const container = document.createElement("div");
document.body.appendChild(container);

const roomManager = new RoomManager(
  container,
  window.innerWidth,
  window.innerHeight
);
const renderer = roomManager.getRenderer();

window.addEventListener("resize", () => roomManager.onWindowResize());

const div = document.createElement("div");
div.style.width = "50%";
div.style.margin = "auto";
div.style.textAlign = "center";
const text = document.createElement("div");
text.innerHTML =
  "<h2>Radet's Sharable 3D Homepage</h2><img src='https://www.fg-a.com/under-construction/digital-construction.gif' /><p>invite up to four (4) friends by having them come to this same page</p><p>Choose your experience:</p>";
const vrButton = document.createElement("button");
vrButton.innerText = "VR";
vrButton.onclick = onVR;
vrButton.style.margin = "5px";

const kbmButton = document.createElement("button");
kbmButton.innerText = "Keyboard & Mouse";
kbmButton.onclick = onScreen;
kbmButton.style.margin = "5px";

div.appendChild(text);
div.appendChild(vrButton);
div.appendChild(kbmButton);
document.body.appendChild(div);
const img = document.createElement("img");
img.src =
  "https://www.fg-a.com/under-construction/flashing-construction-sign.gif";
img.style.display = "block";
img.style.margin = "30px auto";
div.appendChild(img);

function onVR() {
  showStuff();
  document.body.appendChild(VRButton.createButton(renderer));
  roomManager.init("vr");
  roomManager.animate();
}

function onScreen() {
  showStuff();
  roomManager.init("screen");
  roomManager.animate();
}

function showStuff() {
  document.body.removeChild(div);
  container.appendChild(renderer.domElement);
}
