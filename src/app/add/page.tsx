import AddItemForm from "@/components/AddItemForm";

export const metadata = {
  title: "Add Item · Field Day Tracker",
};

export default function AddItemPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Add Inventory Item</h2>
      <p className="text-sm text-gray-500">
        Snap a photo, set quantities, and we’ll auto-flag it as “Pending Order”
        if you still need units.
      </p>
      <AddItemForm />
    </div>
  );
}
