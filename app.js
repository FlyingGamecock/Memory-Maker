import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const baseStorageKey = "launchpad-ideas-v2";
const basePendingDeletesKey = "launchpad-pending-deletes-v2";
const supabaseUrl = "https://ovqksdgfmyxwpjwrhbcr.supabase.co";
const supabaseKey = "sb_publishable_fpMh8zZ--K3G215ykdzTbA_qZoge-SS";
const photoBucket = "idea-photos";
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const ideaForm = document.querySelector("#ideaForm");
const ideaInput = document.querySelector("#ideaInput");
const categoryInput = document.querySelector("#categoryInput");
const dueDateInput = document.querySelector("#dueDateInput");
const notesInput = document.querySelector("#notesInput");
const photoLibraryInput = document.querySelector("#photoLibraryInput");
const photoCameraInput = document.querySelector("#photoCameraInput");
const photoLibraryButton = document.querySelector("#photoLibraryButton");
const photoCameraButton = document.querySelector("#photoCameraButton");
const photoSizeInput = document.querySelector("#photoSizeInput");
const photoPreviewList = document.querySelector("#photoPreviewList");
const ideaList = document.querySelector("#ideaList");
const emptyState = document.querySelector("#emptyState");
const communityList = document.querySelector("#communityList");
const communityEmptyState = document.querySelector("#communityEmptyState");
const totalCount = document.querySelector("#totalCount");
const readyCount = document.querySelector("#readyCount");
const offlineStatus = document.querySelector("#offlineStatus");
const clearDone = document.querySelector("#clearDone");
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
let ideas = [];
let communityIdeas = [];
let pendingDeletes = [];
let isSyncing = false;
let selectedPhotoFiles = [];

function userStorageKey() {
  return `${baseStorageKey}-${user.id}`;
}

function userPendingDeletesKey() {
  return `${basePendingDeletesKey}-${user.id}`;
}

function normalizePhoto(row) {
  return {
    id: row.id,
    idea_id: row.idea_id,
    user_id: row.user_id || user?.id,
    storage_path: row.storage_path,
    width: row.width,
    height: row.height,
    size_bytes: row.size_bytes,
    created_at: row.created_at,
    signed_url: row.signed_url || ""
  };
}

function normalizeIdea(row) {
  return {
    id: row.id,
    user_id: row.user_id || user?.id,
    text: row.text,
    notes: row.notes || "",
    category: row.category || "General",
    due_date: row.due_date || "",
    done: Boolean(row.done),
    is_public: Boolean(row.is_public),
    photos: Array.isArray(row.idea_photos) ? row.idea_photos.map(normalizePhoto) : Array.isArray(row.photos) ? row.photos.map(normalizePhoto) : [],
    updated_at: row.updated_at || new Date().toISOString(),
    pending: Boolean(row.pending)
  };
}

function loadIdeas() {
  if (!user) return [];

  try {
    const saved = JSON.parse(localStorage.getItem(userStorageKey()));
    return Array.isArray(saved) ? saved.map(normalizeIdea) : [];
  } catch {
    return [];
  }
}

function saveIdeas() {
  if (!user) return;
  localStorage.setItem(userStorageKey(), JSON.stringify(ideas));
}

function loadPendingDeletes() {
  if (!user) return [];

  try {
    const saved = JSON.parse(localStorage.getItem(userPendingDeletesKey()));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function savePendingDeletes() {
  if (!user) return;
  localStorage.setItem(userPendingDeletesKey(), JSON.stringify(pendingDeletes));
}

function sortIdeas(entries) {
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

function formatDueDate(value) {
  if (!value) return "";

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
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
  const photos = entries.flatMap((idea) => idea.photos || []);

  await Promise.all(
    photos.map(async (photo) => {
      if (!photo.storage_path) return;
      const { data, error } = await supabase.storage.from(photoBucket).createSignedUrl(photo.storage_path, 3600);
      if (error) {
        if (isSetupMissing(error)) showPhotoSetupMessage();
        return;
      }
      photo.signed_url = data.signedUrl;
    })
  );

  return entries;
}

async function uploadPhotosForIdea(idea, files) {
  if (!user || !navigator.onLine || files.length === 0) return;

  updateNetworkStatus("Uploading");

  for (const file of files) {
    try {
      const resized = await resizeImage(file);
      const photoId = crypto.randomUUID();
      const storagePath = `${user.id}/${idea.id}/${photoId}.jpg`;

      const { error: uploadError } = await supabase.storage.from(photoBucket).upload(storagePath, resized.blob, {
        contentType: "image/jpeg",
        upsert: false
      });

      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from("idea_photos")
        .insert({
          id: photoId,
          idea_id: idea.id,
          user_id: user.id,
          storage_path: storagePath,
          width: resized.width,
          height: resized.height,
          size_bytes: resized.size_bytes
        })
        .select("id,idea_id,user_id,storage_path,width,height,size_bytes,created_at")
        .single();

      if (error) throw error;

      const [photo] = await hydratePhotoUrls([{ photos: [normalizePhoto(data)] }]).then((items) => items[0].photos);
      idea.photos = [...(idea.photos || []), photo];
      saveIdeas();
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

async function removePhoto(ideaId, photoId) {
  const idea = ideas.find((entry) => entry.id === ideaId);
  const photo = idea?.photos.find((entry) => entry.id === photoId);
  if (!idea || !photo || !user) return;

  try {
    const { error: storageError } = await supabase.storage.from(photoBucket).remove([photo.storage_path]);
    if (storageError) throw storageError;

    const { error: rowError } = await supabase.from("idea_photos").delete().eq("id", photoId).eq("user_id", user.id);
    if (rowError) throw rowError;

    idea.photos = idea.photos.filter((entry) => entry.id !== photoId);
    saveIdeas();
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
  ideaInput.disabled = !signedIn;
  categoryInput.disabled = !signedIn;
  dueDateInput.disabled = !signedIn;
  notesInput.disabled = !signedIn;
  photoLibraryInput.disabled = !signedIn;
  photoCameraInput.disabled = !signedIn;
  photoLibraryButton.disabled = !signedIn;
  photoCameraButton.disabled = !signedIn;
  photoSizeInput.disabled = !signedIn;
  ideaForm.querySelector("button").disabled = !signedIn;
  clearDone.disabled = !signedIn;
  emptyState.textContent = signedIn
    ? "Add the first idea and this PWA will keep it here, even after refresh or while offline."
    : "Sign in to load your private build queue.";
}

function render() {
  totalCount.textContent = ideas.length;
  readyCount.textContent = ideas.filter((idea) => idea.done).length;
  emptyState.hidden = ideas.length > 0;
  renderIdeaList(ideaList, ideas, false);
  renderIdeaList(communityList, communityIdeas, true);
  communityEmptyState.hidden = communityIdeas.length > 0;
}

function renderIdeaList(list, entries, readOnly) {
  list.innerHTML = "";

  for (const idea of entries) {
    const item = document.createElement("li");
    item.className = `idea-item${idea.done ? " done" : ""}${readOnly ? " read-only" : ""}`;
    item.dataset.id = idea.id;

    const main = document.createElement("div");
    main.className = "idea-main";

    const content = document.createElement("div");
    content.className = "idea-content";

    if (!readOnly) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = idea.done;
      checkbox.setAttribute("aria-label", `Mark ${idea.text} as ready`);
      label.append(checkbox);
      main.append(label);
    }

    const title = document.createElement("span");
    title.className = "idea-title";
    title.textContent = idea.text;

    const meta = document.createElement("div");
    meta.className = "idea-meta";

    const category = document.createElement("span");
    category.textContent = idea.category || "General";
    meta.append(category);

    if (readOnly && idea.done) {
      const ready = document.createElement("span");
      ready.textContent = "Ready to build";
      meta.append(ready);
    }

    if (idea.due_date) {
      const dueDate = document.createElement("time");
      dueDate.dateTime = idea.due_date;
      dueDate.textContent = `Due ${formatDueDate(idea.due_date)}`;
      meta.append(dueDate);
    }

    content.append(title, meta);

    if (!readOnly) {
      const shareLabel = document.createElement("label");
      shareLabel.className = "share-control";

      const shareToggle = document.createElement("input");
      shareToggle.type = "checkbox";
      shareToggle.className = "share-toggle";
      shareToggle.checked = idea.is_public;
      shareToggle.setAttribute("aria-label", `${idea.is_public ? "Stop sharing" : "Share"} ${idea.text} with the community`);

      const shareText = document.createElement("span");
      shareText.textContent = idea.is_public ? "Shared with community" : "Share with community";
      shareLabel.append(shareToggle, shareText);
      content.append(shareLabel);
    }

    if (idea.notes) {
      const notes = document.createElement("p");
      notes.className = "idea-notes";
      notes.textContent = idea.notes;
      content.append(notes);
    }

    const visiblePhotos = idea.photos.filter((photo) => photo.signed_url);
    if (visiblePhotos.length > 0) {
      const photoGrid = document.createElement("div");
      photoGrid.className = "photo-grid";

      for (const photo of visiblePhotos) {
        const card = document.createElement("div");
        card.className = "photo-card";

        const image = document.createElement("img");
        image.src = photo.signed_url;
        image.alt = `Photo attached to ${idea.text}`;
        image.loading = "lazy";

        card.append(image);
        if (!readOnly) {
          const removePhotoButton = document.createElement("button");
          removePhotoButton.type = "button";
          removePhotoButton.className = "remove-photo-button";
          removePhotoButton.dataset.photoId = photo.id;
          removePhotoButton.dataset.ideaId = idea.id;
          removePhotoButton.textContent = "X";
          removePhotoButton.setAttribute("aria-label", `Remove photo from ${idea.text}`);
          card.append(removePhotoButton);
        }
        photoGrid.append(card);
      }

      content.append(photoGrid);
    }

    if (!readOnly) {
      const photoActions = document.createElement("div");
      photoActions.className = "idea-photo-actions";
      const libraryId = `library-${idea.id}`;
      const cameraId = `camera-${idea.id}`;

      const addPhotosButton = document.createElement("button");
      addPhotosButton.className = "file-button idea-photo-trigger";
      addPhotosButton.type = "button";
      addPhotosButton.dataset.target = libraryId;
      addPhotosButton.textContent = "Add photos";

      const addPhotosInput = document.createElement("input");
      addPhotosInput.id = libraryId;
      addPhotosInput.className = "visually-hidden idea-photo-input";
      addPhotosInput.type = "file";
      addPhotosInput.accept = "image/*";
      addPhotosInput.multiple = true;
      addPhotosInput.dataset.ideaId = idea.id;
      addPhotosInput.setAttribute("aria-label", `Add photos to ${idea.text}`);

      const cameraButton = document.createElement("button");
      cameraButton.className = "file-button idea-photo-trigger";
      cameraButton.type = "button";
      cameraButton.dataset.target = cameraId;
      cameraButton.textContent = "Camera";

      const cameraInput = document.createElement("input");
      cameraInput.id = cameraId;
      cameraInput.className = "visually-hidden idea-photo-input";
      cameraInput.type = "file";
      cameraInput.accept = "image/*";
      cameraInput.capture = "environment";
      cameraInput.dataset.ideaId = idea.id;
      cameraInput.setAttribute("aria-label", `Take a photo for ${idea.text}`);

      photoActions.append(addPhotosButton, addPhotosInput, cameraButton, cameraInput);
      content.append(photoActions);

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-button";
      deleteButton.type = "button";
      deleteButton.textContent = "X";
      deleteButton.setAttribute("aria-label", `Delete ${idea.text}`);

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

async function loadCloudIdeas() {
  if (!user || !navigator.onLine || isSyncing) return;
  isSyncing = true;
  updateNetworkStatus("Syncing");

  try {
    await flushPendingChanges();

    let { data, error } = await supabase
      .from("ideas")
      .select("id,user_id,text,notes,category,due_date,done,is_public,updated_at,idea_photos(id,idea_id,user_id,storage_path,width,height,size_bytes,created_at)")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error && isSetupMissing(error)) {
      showPhotoSetupMessage();
      ({ data, error } = await supabase
        .from("ideas")
        .select("id,user_id,text,notes,category,due_date,done,is_public,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }));
    }

    if (error) throw error;

    const cloudIdeas = await hydratePhotoUrls((data || []).map(normalizeIdea));
    const pendingIdeas = ideas.filter((idea) => idea.pending);
    const merged = new Map(cloudIdeas.map((idea) => [idea.id, idea]));
    pendingIdeas.forEach((idea) => merged.set(idea.id, idea));

    ideas = sortIdeas([...merged.values()]);
    saveIdeas();
    render();
    updateNetworkStatus("Synced");
  } catch (error) {
    console.warn(error);
    updateNetworkStatus("Local");
  } finally {
    isSyncing = false;
  }
  await loadCommunityIdeas();
}

async function loadCommunityIdeas() {
  if (!navigator.onLine) return;

  try {
    const { data, error } = await supabase
      .from("ideas")
      .select("id,text,notes,category,due_date,done,is_public,updated_at,idea_photos(id,idea_id,storage_path,width,height,size_bytes,created_at)")
      .eq("is_public", true)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const visibleIdeas = await hydratePhotoUrls((data || []).map((row) => {
      const idea = normalizeIdea(row);
      idea.user_id = null;
      return idea;
    }));
    communityIdeas = visibleIdeas.filter((idea) => !user || !ideas.some((ownIdea) => ownIdea.id === idea.id));
    render();
  } catch (error) {
    console.warn(error);
    setAuthMessage(`Could not load community ideas: ${error.message}`);
  }
}

async function flushPendingChanges() {
  const pendingIdeas = ideas.filter((idea) => idea.pending);

  for (const idea of pendingIdeas) {
    await syncIdea(idea);
  }

  for (const id of [...pendingDeletes]) {
    const entry = typeof id === "string" ? { id, photos: [] } : id;
    await deleteCloudIdea(entry.id, entry.photos || []);
  }
}

async function syncIdea(idea) {
  if (!user || !navigator.onLine) {
    idea.pending = true;
    saveIdeas();
    updateNetworkStatus("Local");
    return;
  }

  try {
    const { error } = await supabase
      .from("ideas")
      .upsert(
        {
          id: idea.id,
          user_id: user.id,
          text: idea.text,
          notes: idea.notes,
          category: idea.category,
          due_date: idea.due_date || null,
          done: idea.done,
          is_public: Boolean(idea.is_public),
          updated_at: idea.updated_at
        },
        { onConflict: "id" }
      )
      .select();

    if (error) throw error;

    idea.user_id = user.id;
    idea.pending = false;
    saveIdeas();
    updateNetworkStatus("Synced");
  } catch (error) {
    console.warn(error);
    idea.pending = true;
    saveIdeas();
    updateNetworkStatus("Local");
  }
}

async function deleteCloudIdea(id, photos = []) {
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
      .from("ideas")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    const paths = photos.map((photo) => photo.storage_path).filter(Boolean);
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from(photoBucket).remove(paths);
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
  ideas = loadIdeas();
  pendingDeletes = loadPendingDeletes();
  renderAuth();
  render();

  if (user) {
    setAuthMessage("");
    updateNetworkStatus(navigator.onLine ? "Loading" : "Offline");
    await loadCloudIdeas();
  } else {
    updateNetworkStatus(navigator.onLine ? "Online" : "Offline");
    await loadCommunityIdeas();
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

ideaForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!user) {
    setAuthMessage("Sign in before adding ideas.");
    return;
  }

  const text = ideaInput.value.trim();
  const category = categoryInput.value.trim() || "General";
  const dueDate = dueDateInput.value;
  const notes = notesInput.value.trim();
  const photoFiles = [...selectedPhotoFiles];
  if (!text) return;

  const idea = {
    id: crypto.randomUUID(),
    user_id: user.id,
    text,
    notes,
    category,
    due_date: dueDate,
    photos: [],
    done: false,
    updated_at: new Date().toISOString(),
    pending: true
  };

  ideas.unshift(idea);
  saveIdeas();
  render();
  await syncIdea(idea);
  await uploadPhotosForIdea(idea, photoFiles);
  ideaInput.value = "";
  categoryInput.value = "";
  dueDateInput.value = "";
  notesInput.value = "";
  selectedPhotoFiles = [];
  renderSelectedPhotoPreviews();
  ideaInput.focus();
});

ideaList.addEventListener("change", (event) => {
  const checkbox = event.target;
  if (!(checkbox instanceof HTMLInputElement)) return;

  const item = checkbox.closest(".idea-item");
  const idea = ideas.find((entry) => entry.id === item?.dataset.id);
  if (!idea) return;

  if (checkbox.classList.contains("share-toggle")) {
    idea.is_public = checkbox.checked;
    idea.updated_at = new Date().toISOString();
    saveIdeas();
    render();
    syncIdea(idea).then(loadCommunityIdeas);
    return;
  }

  if (checkbox.type !== "checkbox") return;
  idea.done = checkbox.checked;
  idea.updated_at = new Date().toISOString();
  saveIdeas();
  render();
  syncIdea(idea);
});

ideaList.addEventListener("click", (event) => {
  const button = event.target;
  if (!(button instanceof HTMLButtonElement)) return;

  if (button.classList.contains("remove-photo-button")) {
    removePhoto(button.dataset.ideaId, button.dataset.photoId);
    return;
  }

  if (button.classList.contains("idea-photo-trigger")) {
    document.getElementById(button.dataset.target)?.click();
    return;
  }

  if (!button.classList.contains("delete-button")) return;

  const item = button.closest(".idea-item");
  const id = item?.dataset.id;
  const deletedIdea = ideas.find((idea) => idea.id === id);
  ideas = ideas.filter((idea) => idea.id !== item?.dataset.id);
  saveIdeas();
  render();
  if (id) deleteCloudIdea(id, deletedIdea?.photos || []);
});

ideaList.addEventListener("change", async (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.classList.contains("idea-photo-input")) return;

  const idea = ideas.find((entry) => entry.id === input.dataset.ideaId);
  if (!idea) return;

  await uploadPhotosForIdea(idea, Array.from(input.files || []));
  input.value = "";
});

clearDone.addEventListener("click", () => {
  const deletedIdeas = ideas.filter((idea) => idea.done);
  ideas = ideas.filter((idea) => !idea.done);
  saveIdeas();
  render();
  deletedIdeas.forEach((idea) => deleteCloudIdea(idea.id, idea.photos || []));
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
  if (user) loadCloudIdeas();
  else loadCommunityIdeas();
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
