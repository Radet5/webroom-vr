import { io } from "socket.io-client";
import Peer from "simple-peer";
import { Buffer } from "buffer";
import "dotenv/config";
import type { PlayerData } from "../agent/other-player";

const ENV = process.env.NODE_ENV || "development";

export class ServerDataManager {
  #serverURL;
  #socket: any;
  #peers: any;
  #newUserCallback: (userID: string) => void;
  #removeUserCallback: (userID: string) => void;
  #updatePlayerCallback: (userId: string, playerData: PlayerData) => void;
  constructor() {
    if (ENV === "production") {
      this.#serverURL = "https://api.radet5.com:8000";
    } else {
      this.#serverURL = "http://localhost:8000";
    }
    this.#peers = [];
  }

  getPeerCount() {
    return this.#peers.length;
  }

  sendToAll(data: any) {
    this.#peers.forEach((peer: any) => {
      if (peer.connected) {
        peer.peer.send(JSON.stringify({ userID: this.#socket.id, data }));
      }
    });
  }

  registerNewUserCallback(callback: (userID: string) => void) {
    this.#newUserCallback = callback;
  }

  registerRemoveUserCallback(callback: (userID: string) => void) {
    this.#removeUserCallback = callback;
  }

  registerUpdatePlayerCallback(
    callback: (userID: string, playerData: PlayerData) => void
  ) {
    this.#updatePlayerCallback = callback;
  }

  start() {
    this.#socket = io(this.#serverURL, {secure: true, rejectUnauthorized: false});
    this.#socket.emit("join room");
    this.#socket.on("all users", (users: any) => {
      //console.log(users);
      users.forEach((peerID: any) => {
        const peer = this.#createPeer(peerID, this.#socket.id);
        this.#peers.push({ peerID, peer, connected: false });
      });
    });

    this.#socket.on("user joined", (payload: any) => {
      const peer = this.#addPeer(payload.signal, payload.callerID);
      this.#peers.push({ peerID: payload.callerID, peer, connected: false });
    });

    this.#socket.on("receiving returned signal", (payload: any) => {
      const item = this.#peers.find((item: any) => item.peerID === payload.id);
      item.peer.signal(payload.signal);
    });

    this.#socket.on("user left", (id: any) => {
      const item = this.#peers.find((item: any) => item.peerID === id);
      if (item) {
        console.log("DISCONNECTED", id);
        item.peer.destroy();
        if (typeof this.#removeUserCallback === "function") {
          this.#removeUserCallback(id);
        }
      }
      this.#peers = this.#peers.filter((item: any) => item.peerID !== id);
    });
  }

  #parseData(data: any) {
    const parsedData = JSON.parse(Buffer.from(data).toString());
    //console.log(parsedData);
    //console.log(parsedData.userID, "playerData", parsedData.data.playerData.head.position);
    Object.keys(parsedData.data).forEach((key: string) => {
      if (key === "playerData") {
        if (typeof this.#updatePlayerCallback === "function") {
          this.#updatePlayerCallback(parsedData.userID, parsedData.data[key]);
        }
      }
    });
  }

  #onConnect(userID: string) {
    console.log("CONNECTED", userID);
    this.#peers.forEach((peer: any) => {
      if (peer.peerID === userID) {
        peer.connected = true;
      }
    });
    if (typeof this.#newUserCallback === "function") {
      this.#newUserCallback(userID);
    }
  }

  #createPeer(userToSignal: any, callerID: any) {
    const peer = new Peer({
      initiator: true,
      trickle: false,
    });

    peer.on("signal", signal => {
      this.#socket.emit("sending signal", { userToSignal, callerID, signal });
    });

    peer.on("connect", () => this.#onConnect(userToSignal));

    //peer.on("data", (data:any) => console.log(data));
    peer.on("data", (data:any) => this.#parseData(data));

    return peer;
  }

  #addPeer(incomingSignal: any, callerID: any) {
    const peer = new Peer({
      initiator: false,
      trickle: false,
    });

    peer.on("signal", signal => {
      this.#socket.emit("returning signal", { signal, callerID });
    });

    peer.on("connect", () => this.#onConnect(callerID));

    //peer.on("data", handleReceivingData);
    peer.on("data", (data:any) => this.#parseData(data));

    peer.signal(incomingSignal);
    return peer;
  }
}
