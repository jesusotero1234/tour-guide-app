import { LocationData } from "@/types/api";

export async function searchCities(query: string): Promise<LocationData[]> {
  if (!query.trim()) return [];

  try {
    const response = await fetch(`/api/geocoding/cities?q=${encodeURIComponent(query)}`);

    if (!response.ok) {
      throw new Error("Failed to fetch city suggestions");
    }

    return response.json();
  } catch (error) {
    console.error("Error searching cities:", error);
    return [];
  }
}
