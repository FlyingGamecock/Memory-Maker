import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const baseStorageKey = "launchpad-memories-v3";
const legacyStorageKey = "launchpad-ideas-v2";
const basePendingDeletesKey = "launchpad-pending-memory-deletes-v3";
const legacyPendingDeletesKey = "launchpad-pending-deletes-v2";
const supabaseUrl = "https://gzkhdcuaioyyybbedppq.supabase.co";
const supabaseKey = "sb_publishable_pBh31jbSpdlOWlacL-qSLw_4w3icQbK";
const legacyPhotoBucket = "idea-photos";
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const memoryForm = document.querySelector("#memoryForm");
const memoryInput = document.querySelector("#memoryInput");
const notesInput = document.querySelector("#notesInput");
const photoLibraryInput = document.querySelector("#photoLibraryInput");
const photoCameraInput = document.querySelector("#photoCameraInput");
const photoLibraryButton = document.querySelector("#photoLibraryButton");
const photoCameraButton = document.querySelector("#photoCameraButton");
const photoSizeInput = document.querySelector("#photoSizeInput");
const photoPreviewList = document.querySelector("#photoPreviewList");
const memoryList = document.querySelector("#memoryList");
const emptyState = document.querySelector("#emptyState");
const communityList = document.querySelector("#communityList");
const communityEmptyState = document.querySelector("#communityEmptyState");
const totalCount = document.querySelector("#totalCount");
const offlineStatus = document.querySelector("#offlineStatus");
const installButton = document.querySelector("#installButton");
const authForm = document.querySelector("#authForm");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const signInButton = document.querySelector("#signInButton");
const signUpButton = document.querySelector("#signUpButton");
const googleSignInButton = document.querySelector("#googleSignInButton");
const signOutButton = document.querySelector("#signOutButton");
const profilePanel = document.querySelector("#profilePanel");
const userEmail = document.querySelector("#userEmail");
const authMessage = document.querySelector("#authMessage");

let deferredInstallPrompt = null;
let session = null;
let user = null;
let memories = [];
let communityMemories = [];
let pendingDeletes = [];
let isSyncing = false;
let selectedPhotoFiles = [];

function userStorageKey() {
  return `${baseStorageKey}-${user.id}`;
}

function legacyUserStorageKey() {
  return `${legacyStorageKey}-${user.id}`;
}

function userPendingDeletesKey() {
  return `${basePendingDeletesKey}-${user.id}`;
}

function legacyUserPendingDeletesKey() {
  return `${legacyPendingDeletesKey}-${user.id}`;
}

function normalizePhoto(row) {
  return {
    id: row.id,
    memory_id: row.memory_id || row.idea_id,
    user_id: row.user_id || user?.id,
    storage_path: row.storage_path,
    width: row.width,
    height: row.height,
    size_bytes: row.size_bytes,
    created_at: row.created_at,
    signed_url: row.signed_url || ""
  };
}

function normalizeMemory(row) {
  return {
    id: row.id,
    user_id: row.user_id || user?.id,
    text: row.text,
    notes: row.notes || "",
    is_public: Boolean(row.is_public),
    photos: Array.isArray(row.memory_photos)
      ? row.memory_photos.map(normalizePhoto)
      : Array.isArray(row.idea_photos)
        ? row.idea_photos.map(normalizePhoto)
        : Array.isArray(row.photos)
          ? row.photos.map(normalizePhoto)
          : [],
    updated_at: row.updated_at || new Date().toISOString(),
    pending: Boolean(row.pending)
  };
}

function loadMemories() {
  if (!user) return [];

  try {
    const saved = JSON.parse(
      localStorage.getItem(userStorageKey()) || localStorage.getItem(legacyUserStorageKey())
    );
    return Array.isArray(saved) ? saved.map(normalizeMemory) : [];
  } catch {
    return [];
  }
}

function saveMemories() {
  if (!user) return;
  localStorage.setItem(userStorageKey(), JSON.stringify(memories));
}

function loadPendingDeletes() {
  if (!user) return [];

  try {
    const saved = JSON.parse(
      localStorage.getItem(userPendingDeletesKey()) || localStorage.getItem(legacyUserPendingDeletesKey())
    );
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function savePendingDeletes() {
  if (!user) return;
  localStorage.setItem(userPendingDeletesKey(), JSON.stringify(pendingDeletes));
}

function sortMemories(entries) {
  return entries.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
}

function setAuthMessage(message) {
  authMessage.textContent = message;
}

function isSetupMissing(error) {
  const status = String(error?.status || error?.statusCode || "");
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "");

  return (
    status === "404" ||
    code === "42P01" ||
    code === "PGRST200" ||
    code === "PGRST205" ||
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("could not find")
  );
}

function showPhotoSetupMessage() {
  setAuthMessage("Photo storage is not set up yet. Run the updated Supabase SQL, then refresh.");
}

function addSelectedFiles(fileList) {
  const imageFiles = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
  selectedPhotoFiles = [...selectedPhotoFiles, ...imageFiles];
  renderSelectedPhotoPreviews();
}

function renderSelectedPhotoPreviews() {
  photoPreviewList.innerHTML = "";

  selectedPhotoFiles.forEach((file, index) => {
    const item = document.createElement("li");
    const size = Math.max(1, Math.round(file.size / 1024));
    item.textContent = `${file.name || `Photo ${index + 1}`} (${size} KB)`;
    photoPreviewList.append(item);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to load image."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to resize image."));
    }, type, quality);
  });
}

async function resizeImage(file) {
  const maxWidth = Number(photoSizeInput.value) || 1200;
  const image = await loadImage(file);
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.78);
  return { blob, width, height, size_bytes: blob.size };
}

async function hydratePhotoUrls(entries) {
  const photos = entries.flatMap((memory) => memory.photos || []);

  await Promise.all(
    photos.map(async (photo) => {
      if (!photo.storage_path) return;
      const { data, error } = await supabase.storage.from(legacyPhotoBucket).createSignedUrl(photo.storage_path, 3600);
      if (error) {
        if (isSetupMissing(error)) showPhotoSetupMessage();
        return;
      }
      photo.signed_url = data.signedUrl;
    })
  );

  return entries;
}

async function uploadPhotosForMemory(memory, files) {
  if (!user || !navigator.onLine || files.length === 0) return;

  updateNetworkStatus("Uploading");

  for (const file of files) {
    try {
      const resized = await resizeImage(file);
      const photoId = crypto.randomUUID();
      const storagePath = `${user.id}/${memory.id}/${photoId}.jpg`;

      const { error: uploadError } = await supabase.storage.from(legacyPhotoBucket).upload(storagePath, resized.blob, {
        contentType: "image/jpeg",
        upsert: false
      });

      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from("memory_photos")
        .insert({
          id: photoId,
          memory_id: memory.id,
          user_id: user.id,
          storage_path: storagePath,
          width: resized.width,
          height: resized.height,
          size_bytes: resized.size_bytes
        })
        .select("id,memory_id,user_id,storage_path,width,height,size_bytes,created_at")
        .single();

      if (error) throw error;

      const [photo] = await hydratePhotoUrls([{ photos: [normalizePhoto(data)] }]).then((items) => items[0].photos);
      memory.photos = [...(memory.photos || []), photo];
      saveMemories();
      render();
    } catch (error) {
      console.warn(error);
      if (isSetupMissing(error)) {
        showPhotoSetupMessage();
        updateNetworkStatus("Setup needed");
      } else {
        updateNetworkStatus("Upload failed");
      }
    }
  }

  updateNetworkStatus("Synced");
}

async function removePhoto(memoryId, photoId) {
  const memory = memories.find((entry) => entry.id === memoryId);
  const photo = memory?.photos.find((entry) => entry.id === photoId);
  if (!memory || !photo || !user) return;

  try {
    const { error: storageError } = await supabase.storage.from(legacyPhotoBucket).remove([photo.storage_path]);
    if (storageError) throw storageError;

    const { error: rowError } = await supabase.from("memory_photos").delete().eq("id", photoId).eq("user_id", user.id);
    if (rowError) throw rowError;

    memory.photos = memory.photos.filter((entry) => entry.id !== photoId);
    saveMemories();
    render();
    updateNetworkStatus("Synced");
  } catch (error) {
    console.warn(error);
    updateNetworkStatus("Local");
  }
}

function renderAuth() {
  const signedIn = Boolean(user);

  authForm.hidden = signedIn;
  profilePanel.hidden = !signedIn;
  userEmail.textContent = signedIn ? user.email : "";
  memoryInput.disabled = !signedIn;
  notesInput.disabled = !signedIn;
  photoLibraryInput.disabled = !signedIn;
  photoCameraInput.disabled = !signedIn;
  photoLibraryButton.disabled = !signedIn;
  photoCameraButton.disabled = !signedIn;
  photoSizeInput.disabled = !signedIn;
  memoryForm.querySelector('button[type="submit"]').disabled = !signedIn;
  emptyState.textContent = signedIn
    ? "Add the first memory and this PWA will keep it here, even after refresh or while offline."
    : "Sign in to load your memories.";
}

function render() {
  totalCount.textContent = memories.length;
  emptyState.hidden = memories.length > 0;
  renderMemoryList(memoryList, memories, false);
  renderMemoryList(communityList, communityMemories, true);
  communityEmptyState.hidden = communityMemories.length > 0;
}

function renderMemoryList(list, entries, readOnly) {
  list.innerHTML = "";

  for (const memory of entries) {
    const item = document.createElement("li");
    item.className = `memory-item${readOnly ? " read-only" : ""}`;
    item.dataset.id = memory.id;

    const main = document.createElement("div");
    main.className = "memory-main";

    const content = document.createElement("div");
    content.className = "memory-content";

    const title = document.createElement("span");
    title.className = "memory-title";
    title.textContent = memory.text;

    content.append(title);

    if (!readOnly) {
      const shareLabel = document.createElement("label");
      shareLabel.className = "share-control";

      const shareToggle = document.createElement("input");
      shareToggle.type = "checkbox";
      shareToggle.className = "share-toggle";
      shareToggle.checked = memory.is_public;
      shareToggle.setAttribute("aria-label", `${memory.is_public ? "Stop sharing" : "Share"} ${memory.text} with the community`);

      const shareText = document.createElement("span");
      shareText.textContent = memory.is_public ? "Shared with community" : "Share with community";
      shareLabel.append(shareToggle, shareText);
      content.append(shareLabel);
    }

    if (memory.notes) {
      const notes = document.createElement("p");
      notes.className = "memory-notes";
      notes.textContent = memory.notes;
      content.append(notes);
    }

    const visiblePhotos = memory.photos.filter((photo) => photo.signed_url);
    if (visiblePhotos.length > 0) {
      const photoGrid = document.createElement("div");
      photoGrid.className = "photo-grid";

      for (const photo of visiblePhotos) {
        const card = document.createElement("div");
        card.className = "photo-card";

        const image = document.createElement("img");
        image.src = photo.signed_url;
        image.alt = `Photo attached to ${memory.text}`;
        image.loading = "lazy";

        card.append(image);
        if (!readOnly) {
          const removePhotoButton = document.createElement("button");
          removePhotoButton.type = "button";
          removePhotoButton.className = "remove-photo-button";
          removePhotoButton.dataset.photoId = photo.id;
          removePhotoButton.dataset.memoryId = memory.id;
          removePhotoButton.textContent = "X";
          removePhotoButton.setAttribute("aria-label", `Remove photo from ${memory.text}`);
          card.append(removePhotoButton);
        }
        photoGrid.append(card);
      }

      content.append(photoGrid);
    }

    if (!readOnly) {
      const photoActions = document.createElement("div");
      photoActions.className = "memory-photo-actions";
      const libraryId = `library-${memory.id}`;
      const cameraId = `camera-${memory.id}`;

      const addPhotosButton = document.createElement("button");
      addPhotosButton.className = "file-button memory-photo-trigger";
      addPhotosButton.type = "button";
      addPhotosButton.dataset.target = libraryId;
      addPhotosButton.textContent = "Add photos";

      const addPhotosInput = document.createElement("input");
      addPhotosInput.id = libraryId;
      addPhotosInput.className = "visually-hidden memory-photo-input";
      addPhotosInput.type = "file";
      addPhotosInput.accept = "image/*";
      addPhotosInput.multiple = true;
      addPhotosInput.dataset.memoryId = memory.id;
      addPhotosInput.setAttribute("aria-label", `Add photos to ${memory.text}`);

      const cameraButton = document.createElement("button");
      cameraButton.className = "file-button memory-photo-trigger";
      cameraButton.type = "button";
      cameraButton.dataset.target = cameraId;
      cameraButton.textContent = "Camera";

      const cameraInput = document.createElement("input");
      cameraInput.id = cameraId;
      cameraInput.className = "visually-hidden memory-photo-input";
      cameraInput.type = "file";
      cameraInput.accept = "image/*";
      cameraInput.capture = "environment";
      cameraInput.dataset.memoryId = memory.id;
      cameraInput.setAttribute("aria-label", `Take a photo for ${memory.text}`);

      photoActions.append(addPhotosButton, addPhotosInput, cameraButton, cameraInput);
      content.append(photoActions);

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-button";
      deleteButton.type = "button";
      deleteButton.textContent = "X";
      deleteButton.setAttribute("aria-label", `Delete ${memory.text}`);

      main.append(content);
      item.append(main, deleteButton);
    } else {
      main.append(content);
      item.append(main);
    }
    list.append(item);
  }
}

function updateNetworkStatus(status) {
  offlineStatus.textContent = status || (navigator.onLine ? "Online" : "Offline");
}

async function loadCloudMemories() {
  if (!user || !navigator.onLine || isSyncing) return;
  isSyncing = true;
  updateNetworkStatus("Syncing");

  try {
    await flushPendingChanges();

    let { data, error } = await supabase
      .from("memories")
      .select("id,user_id,text,notes,is_public,updated_at,memory_photos(id,memory_id,user_id,storage_path,width,height,size_bytes,created_at)")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error && isSetupMissing(error)) {
      showPhotoSetupMessage();
      ({ data, error } = await supabase
        .from("memories")
        .select("id,user_id,text,notes,is_public,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }));
    }

    if (error) throw error;

    const cloudMemories = await hydratePhotoUrls((data || []).map(normalizeMemory));
    const pendingMemories = memories.filter((memory) => memory.pending);
    const merged = new Map(cloudMemories.map((memory) => [memory.id, memory]));
    pendingMemories.forEach((memory) => merged.set(memory.id, memory));

    memories = sortMemories([...merged.values()]);
    saveMemories();
    render();
    updateNetworkStatus("Synced");
  } catch (error) {
    console.warn(error);
    updateNetworkStatus("Local");
  } finally {
    isSyncing = false;
  }
  await loadCommunityMemories();
}

async function loadCommunityMemories() {
  if (!navigator.onLine) return;

  try {
    const { data, error } = await supabase
      .from("memories")
      .select("id,text,notes,is_public,updated_at,memory_photos(id,memory_id,storage_path,width,height,size_bytes,created_at)")
      .eq("is_public", true)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const visibleMemories = await hydratePhotoUrls((data || []).map((row) => {
      const memory = normalizeMemory(row);
      memory.user_id = null;
      return memory;
    }));
    communityMemories = visibleMemories.filter((memory) => !user || !memories.some((ownMemory) => ownMemory.id === memory.id));
    render();
  } catch (error) {
    console.warn(error);
    setAuthMessage(`Could not load community memories: ${error.message}`);
  }
}

async function flushPendingChanges() {
  const pendingMemories = memories.filter((memory) => memory.pending);

  for (const memory of pendingMemories) {
    await syncMemory(memory);
  }

  for (const id of [...pendingDeletes]) {
    const entry = typeof id === "string" ? { id, photos: [] } : id;
    await deleteCloudMemory(entry.id, entry.photos || []);
  }
}

async function syncMemory(memory) {
  if (!user || !navigator.onLine) {
    memory.pending = true;
    saveMemories();
    updateNetworkStatus("Local");
    return;
  }

  try {
    const { error } = await supabase
      .from("memories")
      .upsert(
        {
          id: memory.id,
          user_id: user.id,
          text: memory.text,
          notes: memory.notes,
          is_public: Boolean(memory.is_public),
          updated_at: memory.updated_at
        },
        { onConflict: "id" }
      )
      .select();

    if (error) throw error;

    memory.user_id = user.id;
    memory.pending = false;
    saveMemories();
    updateNetworkStatus("Synced");
  } catch (error) {
    console.warn(error);
    memory.pending = true;
    saveMemories();
    updateNetworkStatus("Local");
  }
}

async function deleteCloudMemory(id, photos = []) {
  if (!user || !navigator.onLine) {
    if (!pendingDeletes.some((entry) => (typeof entry === "string" ? entry : entry.id) === id)) {
      pendingDeletes.push({ id, photos });
    }
    savePendingDeletes();
    updateNetworkStatus("Local");
    return;
  }

  try {
    const { error } = await supabase
      .from("memories")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    const paths = photos.map((photo) => photo.storage_path).filter(Boolean);
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from(legacyPhotoBucket).remove(paths);
      if (storageError) throw storageError;
    }

    pendingDeletes = pendingDeletes.filter((entry) => (typeof entry === "string" ? entry : entry.id) !== id);
    savePendingDeletes();
    updateNetworkStatus("Synced");
  } catch (error) {
    console.warn(error);
    if (!pendingDeletes.some((entry) => (typeof entry === "string" ? entry : entry.id) === id)) {
      pendingDeletes.push({ id, photos });
    }
    savePendingDeletes();
    updateNetworkStatus("Local");
  }
}

async function handleSession(nextSession) {
  session = nextSession;
  user = session?.user || null;
  memories = loadMemories();
  pendingDeletes = loadPendingDeletes();
  renderAuth();
  render();

  if (user) {
    setAuthMessage("");
    updateNetworkStatus(navigator.onLine ? "Loading" : "Offline");
    await loadCloudMemories();
  } else {
    updateNetworkStatus(navigator.onLine ? "Online" : "Offline");
    await loadCommunityMemories();
  }
}

async function authenticate(mode) {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) return;

  setAuthMessage(mode === "sign-up" ? "Creating account" : "Signing in");

  const result =
    mode === "sign-up"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

  if (result.error) {
    setAuthMessage(result.error.message);
    return;
  }

  passwordInput.value = "";
  setAuthMessage(mode === "sign-up" && !result.data.session ? "Check your email to confirm the account." : "");
  await handleSession(result.data.session);
}

async function signInWithGoogle() {
  setAuthMessage("Opening Google");

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}`
    }
  });

  if (error) setAuthMessage(error.message);
}

memoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!user) {
    setAuthMessage("Sign in before adding memories.");
    return;
  }

  const text = memoryInput.value.trim();
  const notes = notesInput.value.trim();
  const photoFiles = [...selectedPhotoFiles];
  if (!text) return;

  const memory = {
    id: crypto.randomUUID(),
    user_id: user.id,
    text,
    notes,
    photos: [],
    updated_at: new Date().toISOString(),
    pending: true
  };

  memories.unshift(memory);
  saveMemories();
  render();
  await syncMemory(memory);
  await uploadPhotosForMemory(memory, photoFiles);
  memoryInput.value = "";
  notesInput.value = "";
  selectedPhotoFiles = [];
  renderSelectedPhotoPreviews();
  memoryInput.focus();
});

memoryList.addEventListener("change", (event) => {
  const checkbox = event.target;
  if (!(checkbox instanceof HTMLInputElement)) return;

  const item = checkbox.closest(".memory-item");
  const memory = memories.find((entry) => entry.id === item?.dataset.id);
  if (!memory) return;

  if (checkbox.classList.contains("share-toggle")) {
    memory.is_public = checkbox.checked;
    memory.updated_at = new Date().toISOString();
    saveMemories();
    render();
    syncMemory(memory).then(loadCommunityMemories);
  }
});

memoryList.addEventListener("click", (event) => {
  const button = event.target;
  if (!(button instanceof HTMLButtonElement)) return;

  if (button.classList.contains("remove-photo-button")) {
    removePhoto(button.dataset.memoryId, button.dataset.photoId);
    return;
  }

  if (button.classList.contains("memory-photo-trigger")) {
    document.getElementById(button.dataset.target)?.click();
    return;
  }

  if (!button.classList.contains("delete-button")) return;

  const item = button.closest(".memory-item");
  const id = item?.dataset.id;
  const deletedMemory = memories.find((memory) => memory.id === id);
  memories = memories.filter((memory) => memory.id !== item?.dataset.id);
  saveMemories();
  render();
  if (id) deleteCloudMemory(id, deletedMemory?.photos || []);
});

memoryList.addEventListener("change", async (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.classList.contains("memory-photo-input")) return;

  const memory = memories.find((entry) => entry.id === input.dataset.memoryId);
  if (!memory) return;

  await uploadPhotosForMemory(memory, Array.from(input.files || []));
  input.value = "";
});

signInButton.addEventListener("click", () => authenticate("sign-in"));
signUpButton.addEventListener("click", () => authenticate("sign-up"));
googleSignInButton.addEventListener("click", signInWithGoogle);
photoLibraryButton.addEventListener("click", () => photoLibraryInput.click());
photoCameraButton.addEventListener("click", () => photoCameraInput.click());
photoLibraryInput.addEventListener("change", () => {
  addSelectedFiles(photoLibraryInput.files);
  photoLibraryInput.value = "";
});
photoCameraInput.addEventListener("change", () => {
  addSelectedFiles(photoCameraInput.files);
  photoCameraInput.value = "";
});
authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  authenticate("sign-in");
});

signOutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  setAuthMessage("");
  await handleSession(null);
});

window.addEventListener("online", () => {
  updateNetworkStatus();
  if (user) loadCloudMemories();
  else loadCommunityMemories();
});
window.addEventListener("offline", updateNetworkStatus);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js");
  });
}

supabase.auth.onAuthStateChange((_event, nextSession) => {
  handleSession(nextSession);
});

const {
  data: { session: initialSession }
} = await supabase.auth.getSession();

renderAuth();
render();
handleSession(initialSession);
