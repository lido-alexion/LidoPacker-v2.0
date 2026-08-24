export interface AttributeOption {
  id: string;
  label: string;
  initiallySelected: boolean;
}

export const PERSONAS: AttributeOption[] = [
  { id: "man", label: "Men", initiallySelected: true },
  { id: "woman", label: "Women", initiallySelected: true },
  { id: "kids", label: "Kids", initiallySelected: false },
  { id: "baby", label: "Babies", initiallySelected: false },
];

export const WEATHERS: AttributeOption[] = [
  { id: "snowy", label: "Snowy", initiallySelected: false },
  { id: "cold", label: "Cold", initiallySelected: false },
  { id: "warm-weather", label: "Warm", initiallySelected: false },
  { id: "hot", label: "Hot", initiallySelected: false },
  { id: "pleasant-weather", label: "Pleasant", initiallySelected: true },
  { id: "rainy", label: "Rainy", initiallySelected: false },
];

export const VEHICLES: AttributeOption[] = [
  { id: "flight", label: "Flight", initiallySelected: false },
  { id: "car", label: "Car", initiallySelected: false },
  { id: "bike", label: "Bike", initiallySelected: false },
  { id: "other transport", label: "Others", initiallySelected: true },
];

export const TRIP_TYPES: string[] = [
  "Essentials",
  "Beach",
  "Business",
  "Cycling",
  "Riding",
  "International",
  "Photography",
  "Camping",
  "Cooking",
  "Dog",
  "Festival",
  "Hiking",
  "Public",
  "Backpacking",
  "Camper",
  "Cruise",
  "Diving",
  "Fishing",
  "Fitness",
  "Outdoors",
  "Golf",
  "Office",
  "Sightseeing",
  "Swimming",
  "Wintersport",
  "Running",
  "Surfing",
];

export interface TripAttributes {
  travellers: string[];
  vehicles: string[];
  weathers: string[];
  types: string[];
}

export function defaultTripAttributes(): TripAttributes {
  const vehicles = VEHICLES.filter((v) => v.initiallySelected).map((v) => v.id);
  return {
    travellers: PERSONAS.filter((p) => p.initiallySelected).map((p) => p.id),
    vehicles: [...vehicles],
    weathers: WEATHERS.filter((w) => w.initiallySelected).map((w) => w.id),
    types: ["Essentials", ...vehicles],
  };
}

export function labelFor(id: string, options: AttributeOption[]): string {
  return options.find((o) => o.id === id)?.label || id;
}
