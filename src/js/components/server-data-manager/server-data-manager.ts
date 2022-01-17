import axios from "axios";

export class ServerDataManager {
  #serverURL;
  #pollingTimeout: ReturnType<typeof setTimeout>;
  constructor() {
    this.#serverURL = "http://localhost:3000/api";
  }

  start() {
    axios
      .get(this.#serverURL + "/initialize")
      .then((response) => {
        console.log(response.data);
        this.#poll(response.data.id);
      })
      .catch((error) => {
        console.log(error);
      });
  }

  #poll(id: number) {
    this.#pollingTimeout = setTimeout(() => {
      axios
        .post(this.#serverURL + "/poll", { id })
        .then((response) => {
          console.log(JSON.stringify(response.data.connections));
          this.#poll(id);
        })
        .catch((error) => {
          console.log(error);
          if (error.response.status === 408) {
            this.start();
          }
        });
    }, 5000);
  }
}
