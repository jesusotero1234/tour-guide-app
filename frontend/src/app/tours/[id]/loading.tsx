export default function TourDetailLoading() {
  return (
    <div className="min-h-screen bg-beige">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center py-24">
            <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-darkBrown border-r-transparent" />
            <p className="mt-4 text-darkBrown/70 font-serif text-lg">Loading tour...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
