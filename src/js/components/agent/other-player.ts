import * as THREE from 'three';

export class OtherPlayer {
  #userID;
  #dolly;
  constructor(userID: string) {
    this.#userID = userID;
    this.#dolly = new THREE.Group();

    let hex, i;
    let result = "";
    for (i = 0; i < userID.length; i++) {
      hex = userID.charCodeAt(i).toString(16);
      result += hex.slice(-4);
    }
    const color = "#" + result.substring(0, 6);

    const boxgeometry = new THREE.BoxGeometry();
    const boxMaterial = new THREE.MeshBasicMaterial({ color });
    const boxMesh = new THREE.Mesh(boxgeometry, boxMaterial);
    boxMesh.position.set(0, 0.5, 0);
    boxMesh.scale.set(0.5, 1, 0.2);
    this.#dolly.add(boxMesh);
  }

  addToScene(scene: THREE.Scene) {
    scene.add(this.#dolly);
  }

  removeFromScene(scene: THREE.Scene) {
    this.#dolly.children.forEach(child => {
      scene.remove(child);
    });
    scene.remove(this.#dolly);
  }

  setPosition(position: {x: number, y: number, z: number}) {
    this.#dolly.position.set(position.x, position.y, position.z);
  }
}
