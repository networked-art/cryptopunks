import re

TRAIT_NAMES = (
  "Alien",
  "Ape",
  "Female",
  "Male",
  "Zombie",
  "Alien",
  "Ape",
  "Female 1",
  "Female 2",
  "Female 3",
  "Female 4",
  "Male 1",
  "Male 2",
  "Male 3",
  "Male 4",
  "Zombie",
  "0 Attributes",
  "1 Attributes",
  "2 Attributes",
  "3 Attributes",
  "4 Attributes",
  "5 Attributes",
  "6 Attributes",
  "7 Attributes",
  "3D Glasses",
  "Bandana",
  "Beanie",
  "Big Beard",
  "Big Shades",
  "Black Lipstick",
  "Blonde Bob",
  "Blonde Short",
  "Blue Eye Shadow",
  "Buck Teeth",
  "Cap",
  "Cap Forward",
  "Chinstrap",
  "Choker",
  "Cigarette",
  "Classic Shades",
  "Clown Eyes Blue",
  "Clown Eyes Green",
  "Clown Hair Green",
  "Clown Nose",
  "Cowboy Hat",
  "Crazy Hair",
  "Dark Hair",
  "Do-rag",
  "Earring",
  "Eye Mask",
  "Eye Patch",
  "Fedora",
  "Front Beard",
  "Front Beard Dark",
  "Frown",
  "Frumpy Hair",
  "Goat",
  "Gold Chain",
  "Green Eye Shadow",
  "Half Shaved",
  "Handlebars",
  "Headband",
  "Hoodie",
  "Horned Rim Glasses",
  "Hot Lipstick",
  "Knitted Cap",
  "Luxurious Beard",
  "Medical Mask",
  "Messy Hair",
  "Mohawk",
  "Mohawk Dark",
  "Mohawk Thin",
  "Mole",
  "Mustache",
  "Muttonchops",
  "Nerd Glasses",
  "Normal Beard",
  "Normal Beard Black",
  "Orange Side",
  "Peak Spike",
  "Pigtails",
  "Pilot Helmet",
  "Pink With Hat",
  "Pipe",
  "Police Cap",
  "Purple Eye Shadow",
  "Purple Hair",
  "Purple Lipstick",
  "Red Mohawk",
  "Regular Shades",
  "Rosy Cheeks",
  "Shadow Beard",
  "Shaved Head",
  "Silver Chain",
  "Small Shades",
  "Smile",
  "Spots",
  "Straight Hair",
  "Straight Hair Blonde",
  "Straight Hair Dark",
  "Stringy Hair",
  "Tassle Hat",
  "Tiara",
  "Top Hat",
  "VR",
  "Vampire Hair",
  "Vape",
  "Welding Goggles",
  "Wild Blonde",
  "Wild Hair",
  "Wild White Hair",
)


# Trait ids are grouped by kind in catalog order (the dataset is frozen):
#   0..4    NormalizedType  (Alien, Ape, Female, Male, Zombie)
#   5..15   HeadVariant     (Alien, Ape, Female 1..4, Male 1..4, Zombie)
#   16..23  AttributeCount  ("0 Attributes" .. "7 Attributes")
#   24..110 Accessory
HEAD_VARIANT_IDS = range(5, 16)

# Human head variants carry a skin tone, ordered Dark → Brown → Fair → Albino
# across the four Female/Male slots — matching the SDK's `skinToneNames`. Alien,
# Ape, and Zombie head variants have no skin tone.
SKIN_TONE_NAMES = ("Dark", "Brown", "Fair", "Albino")
_HEAD_VARIANT_RE = re.compile(r"^(?:Female|Male) ([1-4])$")
_ATTRIBUTE_COUNT_RE = re.compile(r"^(\d+) Attributes$")


def trait_name_for_id(trait_id: int) -> str:
  if 0 <= trait_id < len(TRAIT_NAMES):
    return TRAIT_NAMES[trait_id]
  return f"Trait {trait_id}"


def display_trait_name(trait_id: int) -> str | None:
  """Front-end-aligned label for a trait, or None when the trait carries no
  standalone label and should be dropped from display.

  Mirrors `usePunkDisplayTraits` in punks.auction so the predictor's value
  drivers read in the same vocabulary as the rest of the app:
    - human head variants            -> "<Dark|Brown|Fair|Albino> skin"
    - Alien/Ape/Zombie head variants -> None (drop; duplicates the Type trait)
    - "1 Attributes"                 -> "1 Attribute" (singular)
    - everything else                -> the raw catalog name
  """
  name = trait_name_for_id(trait_id)
  if trait_id in HEAD_VARIANT_IDS:
    match = _HEAD_VARIANT_RE.match(name)
    if match is None:
      return None
    return f"{SKIN_TONE_NAMES[int(match.group(1)) - 1]} skin"
  attributes = _ATTRIBUTE_COUNT_RE.match(name)
  if attributes is not None:
    count = int(attributes.group(1))
    return f"{count} {'Attribute' if count == 1 else 'Attributes'}"
  return name
