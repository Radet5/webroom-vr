import * as THREE from "three";
import { User } from "./user";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls";

interface ScreenUserParams {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  container: HTMLElement;
}

export class ScreenUser extends User {
  #previousPosition: THREE.Vector3;
  #controls;
  #temp_posistion;
  constructor({ renderer, camera, container }: ScreenUserParams) {
    super({ renderer, camera, container });

    this.#temp_posistion = new THREE.Vector3();

    this.#previousPosition = new THREE.Vector3();

    this.#controls = new PointerLockControls(camera, renderer.domElement);
    const controls = this.#controls;
    document.addEventListener(
      "click",
      function () {
        controls.lock();
      },
      false
    );
    const onKeyDown = function (event: KeyboardEvent) {
      switch (event.code) {
        case "KeyW":
          controls.moveForward(0.25);
          break;
        case "KeyA":
          controls.moveRight(-0.25);
          break;
        case "KeyS":
          controls.moveForward(-0.25);
          break;
        case "KeyD":
          controls.moveRight(0.25);
          break;
      }
    };
    document.addEventListener("keydown", onKeyDown, false);
  }

  setPosition(x: number, y: number, z: number) {
    this._dolly.position.set(x, y, z);
  }

  getPosition() {
    return this._camera.getWorldPosition(this.#temp_posistion);
  }

  getBodyQuaternion(): THREE.Quaternion {
    return this._camera.quaternion;
  }

  getType() {
    return "screen-user";
  }

  update() {
    if (this.#previousPosition.distanceTo(this._camera.position) > 0.01) {
      this._moving = true;
    } else {
      this._moving = false;
    }
    this.#previousPosition.copy(this._camera.position);
  }
}
