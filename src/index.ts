import { gql } from "apollo-server-core";
import { makeExecutableSchema } from "@graphql-tools/schema";

import { boot } from "./boot";

abstract class Aggregate {
  abstract id: string;
}

abstract class Store<A extends Aggregate> {
  abstract load(id: string): Promise<A | undefined>;
  abstract save(instance: A): Promise<void>;
}

class InMemoryStore<A extends Aggregate> extends Store<A> {
  storage = new Map<string, A>();

  load(id: string): Promise<A | undefined> {
    return Promise.resolve(this.storage.get(id));
  }

  save(instance: A): Promise<void> {
    this.storage.set(instance.id, instance);
    return Promise.resolve();
  }

  all() {
    return Array.from(this.storage.values());
  }
}

class Person extends Aggregate {
  constructor(public readonly name: string, public age: number) {
    super();
  }

  get id() {
    return this.name;
  }
}

class Car extends Aggregate {
  ownerName?: string;
  constructor(public readonly greyCardId: string) {
    super();
  }

  get id() {
    return this.greyCardId;
  }

  registerTo(ownerName: string) {
    this.ownerName = ownerName;
  }
}

const personStore = new InMemoryStore<Person>();
const carStore = new InMemoryStore<Car>();

const john = new Person("John", 30);
const jane = new Person("Jane", 25);
const punto = new Car("12345");
const multipla = new Car("67890");

multipla.registerTo("John");
punto.registerTo("Jane");

personStore.save(john);
personStore.save(jane);
carStore.save(punto);
carStore.save(multipla);

const schema = makeExecutableSchema({
  typeDefs: gql`
    type Person {
      name: String!
      age: Int!
      cars: [Car!]!
    }

    type Car {
      greyCardId: String!
      owner: Person
    }

    type Query {
      people: [Person!]!
      cars: [Car!]!
    }

    type Mutation {
      buyNewCar: Car
    }
  `,
  resolvers: {
    Mutation: {
      buyNewCar: async () => {
        const newCar = new Car(`${Math.random()}`.substring(2, 8));
        newCar.registerTo(jane.name);
        carStore.save(newCar);
        return newCar;
      },
    },
    Query: {
      people: () => personStore.all(),
      cars: () => carStore.all(),
    },
    Person: {
      cars: async (person: Person) => {
        // or use a projection / efficient db query to retrieve the right cars
        const cars = await carStore.all();
        return cars.filter((car) => car.ownerName === person.name);
      },
    },
    Car: {
      owner: async (car: Car) => {
        // we can bypass the applicative layer when doing CQRS,
        // but otherwise its better to use a query from the applicative
        // layer rather than using the store directly
        // (the logic "if car.ownerName" belongs to the applicative layer)
        if (car.ownerName) {
          const owner = await personStore.load(car.ownerName);
          return owner;
        }
      },
    },
  },
});

boot(4000, schema);
