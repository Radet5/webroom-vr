import { Vec3 } from "math/Vec3";
import * as THREE from "three";

interface SimpleVector3 {
  x: number;
  y: number;
  z: number;
}

interface PlayerPart {
  position: { x: number; y: number; z: number };
  quaternion: { _x: number; _y: number; _z: number; _w: number };
}

export interface PlayerData {
  body: PlayerPart;
  head: PlayerPart;
  hand0: PlayerPart;
  hand1: PlayerPart;
  type: string;
}

export class OtherPlayer {
  #userID;
  #hand0: THREE.Group;
  #hand1: THREE.Group;
  #head: THREE.Mesh;
  #body: THREE.Mesh;
  #dolly;
  #playerType;
  #playerColor;
  constructor(userID: string) {
    this.#playerType = "";
    this.#userID = userID;
    this.#dolly = new THREE.Group();
    this.#playerColor = this.#colorFromUserID();
  }

  addToScene(scene: THREE.Scene) {
    scene.add(this.#dolly);
  }

  removeFromScene(scene: THREE.Scene) {
    this.#dolly.children.forEach((child) => {
      scene.remove(child);
    });
    scene.remove(this.#dolly);
  }

  grabObject(
    object: THREE.Object3D,
    controllerIndex: number,
    objectPosition: THREE.Vector3
  ) {
    object.position.set(objectPosition.x, objectPosition.y, objectPosition.z);
    if (controllerIndex == 0) {
      this.#hand0.attach(object);
      this.#hand0.userData.grabbedObject = object;
    } else {
      this.#hand1.attach(object);
      this.#hand0.userData.grabbedObject = object;
    }
  }

  getHeldObject(controllerIndex: number) {
    if (controllerIndex == 0) {
      return this.#hand0.userData.grabbedObject;
    } else {
      return this.#hand1.userData.grabbedObject;
    }
  }

  setPlayerData(playerData: PlayerData) {
    if (playerData.type == "screen-user") {
      if (playerData.type != this.#playerType) {
        this.#body = this.#initBody();
        this.#dolly.add(this.#body);
        this.#playerType = playerData.type;
      }
    } else if (playerData.type == "vr-user") {
      if (this.#playerType == "screen-user") {
        this.#dolly.children.forEach((child) => {
          child.visible = false;
        });
      }
      if (playerData.type != this.#playerType) {

        this.#hand0 = new THREE.Group();
        this.#hand0.add(this.#initHand());
        this.#hand1 = new THREE.Group();
        this.#hand1.add(this.#initHand());
        this.#head = this.#initHead();
        this.#dolly.add(this.#hand0);
        this.#dolly.add(this.#hand1);
        this.#dolly.add(this.#head);
        this.#dolly.rotateY(180);
        this.#playerType = playerData.type;
      }

      const hand0Position = playerData.hand0.position;
      const hand0Quaternion = playerData.hand0.quaternion;
      const hand1Position = playerData.hand1.position;
      const hand1Quaternion = playerData.hand1.quaternion;
      const headPosition = playerData.head.position;
      const headQuaternion = playerData.head.quaternion;

      this.#hand0.position.set(hand0Position.x, hand0Position.y, hand0Position.z);
      this.#hand0.quaternion.set(hand0Quaternion._x, hand0Quaternion._y, hand0Quaternion._z, hand0Quaternion._w);
      this.#hand1.position.set(hand1Position.x, hand1Position.y, hand1Position.z);
      this.#hand1.quaternion.set(hand1Quaternion._x, hand1Quaternion._y, hand1Quaternion._z, hand1Quaternion._w);
      this.#head.position.set(headPosition.x, headPosition.y, headPosition.z);
      this.#head.quaternion.set(headQuaternion._x, headQuaternion._y, headQuaternion._z, headQuaternion._w);
    }
    const bodyPosition = playerData.body.position;
    const bodyQuaternion = playerData.body.quaternion;


    this.#dolly.position.set(bodyPosition.x, bodyPosition.y, bodyPosition.z);
    this.#dolly.quaternion.set(
      bodyQuaternion._x,
      bodyQuaternion._y,
      bodyQuaternion._z,
      bodyQuaternion._w
    );
  }

  #initHead() {
    return this.makeBox(
      { x: 0, y: 0, z: 0 },
      { x: 0.2, y: 0.2, z: 0.2 },
      this.#playerColor
    );
  }

  #initHand() {
    return this.makeBox(
      { x: 0, y: 0, z: 0 },
      { x: 0.02, y: 0.05, z: 0.1 },
      this.#playerColor
    );
  }

  #initBody() {
    return this.makeBox(
      { x: 0, y: 0.0, z: 0 },
      { x: 0.5, y: 1, z: 0.2 },
      this.#playerColor
    );
  }

  makeBox(position: SimpleVector3, scale: SimpleVector3, color: string) {
    const boxgeometry = new THREE.BoxGeometry();
    const boxMaterial = new THREE.MeshBasicMaterial({ color });
    const boxMesh = new THREE.Mesh(boxgeometry, boxMaterial);
    boxMesh.position.set(position.x, position.y, position.z);
    boxMesh.scale.set(scale.x, scale.y, scale.z);
    return boxMesh;
  }

  #colorFromUserID() {
    let hex, i;
    let result = "";
    for (i = 0; i < this.#userID.length; i++) {
      hex = this.#userID.charCodeAt(i).toString(16);
      result += hex.slice(-4);
    }
    return "#" + result.substring(0, 6);
  }
}
