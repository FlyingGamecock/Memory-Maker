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
const memoryFormTitle = document.querySelector("#memoryFormTitle");
const memorySubmitButton = document.querySelector("#memorySubmitButton");
const cancelMemoryEditButton = document.querySelector("#cancelMemoryEditButton");
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
const adminMemoryList = document.querySelector("#adminMemoryList");
const adminUserList = document.querySelector("#adminUserList");
const adminUsersEmpty = document.querySelector("#adminUsersEmpty");
const adminMemoriesEmpty = document.querySelector("#adminMemoriesEmpty");
const adminMessage = document.querySelector("#adminMessage");
const photoLightbox = document.querySelector("#photoLightbox");
const photoLightboxImage = document.querySelector("#photoLightboxImage");
const photoLightboxClose = document.querySelector("#photoLightboxClose");
const pageViews = document.querySelectorAll("[data-page-view]");
const pageLinks = document.querySelectorAll("[data-page-link]");
const skipLink = document.querySelector("#skipLink");
const navigationMessage = document.querySelector("#navigationMessage");
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
let adminUsers = [];
let pendingDeletes = [];
let isSyncing = false;
let isAdmin = false;
let selectedPhotoFiles = [];
let photoLightboxTrigger = null;
let editingMemoryId = null;
let editingFromAdmin = false;

function renderPage(page) {
  for (const view of pageViews) {
    view.hidden = view.dataset.pageView !== page;
  }

  for (const link of pageLinks) {
    if (link.dataset.pageLink === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }

  document.body.dataset.page = page;
  const pageTitles = {
    login: "Sign in",
    memories: "My memories",
    community: "Community",
    admin: "Admin"
  };
  document.title = `${pageTitles[page]} | Memory Maker`;
  skipLink.href = page === "login"
    ? "#authForm"
    : page === "memories"
      ? "#memoryForm"
      : page === "admin"
        ? "#adminTitle"
        : "#communityTitle";
}

function navigateToPage(requestedPage, replace = false) {
  const validPage = ["login", "memories", "community", "admin"].includes(requestedPage);
  let page = validPage ? requestedPage : "login";

  if (page === "memories" && !user) {
    page = "login";
    setAuthMessage("Sign in to view your memories.");
  } else if (page === "login" && user) {
    page = "memories";
  }

  if (page === "admin" && !isAdmin) {
    page = user ? "community" : "login";
    setNavigationMessage(adminMessage.textContent || "Administrator access is required.");
  } else {
    setNavigationMessage("");
  }

  const url = new URL(window.location.href);
  url.searchParams.set("page", page);
  if (replace) window.history.replaceState({}, "", url);
  else if (url.href !== window.location.href) window.history.pushState({}, "", url);
  renderPage(page);
  if (page === "admin") loadAdminPage();
}

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
  localStorage.setItem(
    userStorageKey(),
    JSON.stringify(memories.filter((memory) => memory.user_id === user.id))
  );
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

function setAdminMessage(message) {
  adminMessage.textContent = message;
}

function setNavigationMessage(message) {
  navigationMessage.textContent = message;
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
      const photoOwnerId = memory.user_id || user.id;
      const storagePath = `${photoOwnerId}/${memory.id}/${photoId}.jpg`;

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
          user_id: photoOwnerId,
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
      if (memory.user_id === user.id) saveMemories();
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
  const memory = memories.find((entry) => entry.id === memoryId)
    || adminMemories.find((entry) => entry.id === memoryId);
  const photo = memory?.photos.find((entry) => entry.id === photoId);
  if (!memory || !photo || !user) return;

  try {
    const { error: storageError } = await supabase.storage.from(legacyPhotoBucket).remove([photo.storage_path]);
    if (storageError) throw storageError;

    let photoDelete = supabase.from("memory_photos").delete().eq("id", photoId);
    if (!isAdmin) photoDelete = photoDelete.eq("user_id", user.id);
    const { error: rowError } = await photoDelete;
    if (rowError) throw rowError;

    memory.photos = memory.photos.filter((entry) => entry.id !== photoId);
    if (memory.user_id === user.id) saveMemories();
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
  pageLinks[0].hidden = signedIn;
  pageLinks[3].hidden = !isAdmin;
  memoryInput.disabled = !signedIn;
  notesInput.disabled = !signedIn;
  photoLibraryInput.disabled = !signedIn;
  photoCameraInput.disabled = !signedIn;
  photoLibraryButton.disabled = !signedIn;
  photoCameraButton.disabled = !signedIn;
  photoSizeInput.disabled = !signedIn;
  memorySubmitButton.disabled = !signedIn;
  cancelMemoryEditButton.disabled = !signedIn;
  emptyState.textContent = signedIn
    ? "Add the first memory and this PWA will keep it here, even after refresh or while offline."
    : "Sign in to load your memories.";
}

async function loadAdminAccess() {
  if (!user) return false;
  const checkingUserId = user.id;

  const { data, error } = await supabase.rpc("is_admin");
  if (user?.id !== checkingUserId) return false;
  if (error) {
    console.warn(error);
    setAdminMessage(`Could not verify administrator access: ${error.message}`);
    setNavigationMessage(`Could not verify administrator access: ${error.message}`);
    return false;
  }

  return data === true;
}

function resetMemoryEditor() {
  editingMemoryId = null;
  editingFromAdmin = false;
  memoryForm.reset();
  selectedPhotoFiles = [];
  renderSelectedPhotoPreviews();
  memoryFormTitle.textContent = "Add memory";
  memorySubmitButton.textContent = "Add";
  cancelMemoryEditButton.hidden = true;
}

function editMemory(memory, fromAdmin = false) {
  if (fromAdmin && !navigator.onLine) {
    setAdminMessage("Connect to the internet before editing all memories.");
    return;
  }

  editingMemoryId = memory.id;
  editingFromAdmin = fromAdmin;
  if (fromAdmin) navigateToPage("memories");
  memoryInput.value = memory.text;
  notesInput.value = memory.notes;
  selectedPhotoFiles = [];
  renderSelectedPhotoPreviews();
  memoryFormTitle.textContent = "Edit memory";
  memorySubmitButton.textContent = "Save changes";
  cancelMemoryEditButton.hidden = false;
  memoryForm.scrollIntoView({ behavior: "smooth", block: "start" });
  memoryInput.focus({ preventScroll: true });
}

function render() {
  totalCount.textContent = memories.length;
  emptyState.hidden = memories.length > 0;
  renderMemoryList(memoryList, memories, false);
  renderMemoryList(communityList, communityMemories, true);
  communityEmptyState.hidden = communityMemories.length > 0;
  renderMemoryList(adminMemoryList, adminMemories, false, true);
  adminMemoriesEmpty.hidden = adminMemories.length > 0;
}

let adminMemories = [];

function renderMemoryList(list, entries, readOnly, adminMode = false) {
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

    if (adminMode) {
      const owner = document.createElement("p");
      owner.className = "memory-owner";
      const ownerEmail = adminUsers.find((entry) => entry.user_id === memory.user_id)?.email || "Unknown account";
      owner.textContent = `Owner: ${ownerEmail}`;
      content.append(owner);
    }

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

        const thumbnail = document.createElement("button");
        thumbnail.className = "photo-thumbnail";
        thumbnail.type = "button";
        thumbnail.dataset.photoUrl = photo.signed_url;
        thumbnail.dataset.photoAlt = `Photo attached to ${memory.text}`;
        thumbnail.setAttribute("aria-label", `View photo attached to ${memory.text} fullscreen`);

        const image = document.createElement("img");
        image.src = photo.signed_url;
        image.alt = "";
        image.loading = "lazy";
        thumbnail.append(image);
        card.append(thumbnail);
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

      const editButton = document.createElement("button");
      editButton.className = "edit-memory-button";
      editButton.type = "button";
      editButton.textContent = "Edit";
      editButton.setAttribute("aria-label", `Edit ${memory.text}`);

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-button";
      deleteButton.type = "button";
      deleteButton.textContent = "X";
      deleteButton.setAttribute("aria-label", `Delete ${memory.text}`);

      main.append(content);
      item.append(main, editButton, deleteButton);
    } else {
      main.append(content);
      item.append(main);
    }

    if (adminMode && !navigator.onLine) {
      item.querySelectorAll("button, input").forEach((control) => {
        control.disabled = true;
      });
    }

    list.append(item);
  }
}

function renderAdminUsers() {
  adminUserList.innerHTML = "";
  adminUsersEmpty.hidden = adminUsers.length > 0;

  for (const account of adminUsers) {
    const item = document.createElement("li");
    item.className = "admin-user-item";

    const email = document.createElement("span");
    email.textContent = account.email || "Account without email";

    const status = document.createElement("span");
    status.className = "admin-user-status";
    status.textContent = account.is_admin ? "Admin" : "User";

    const button = document.createElement("button");
    button.className = "admin-role-button";
    button.type = "button";
    button.dataset.userId = account.user_id;
    button.dataset.makeAdmin = String(!account.is_admin);
    button.textContent = account.is_admin ? "Remove admin" : "Make admin";
    button.setAttribute(
      "aria-label",
      `${account.is_admin ? "Remove admin access from" : "Make"} ${account.email || "user"}`
    );

    item.append(email, status, button);
    adminUserList.append(item);
  }
}

async function loadAdminPage() {
  if (!user || !isAdmin) return;
  setAdminMessage("");

  const [usersResult, memoriesResult] = await Promise.all([
    supabase.rpc("list_app_users"),
    supabase
      .from("memories")
      .select("id,user_id,text,notes,is_public,updated_at,memory_photos(id,memory_id,user_id,storage_path,width,height,size_bytes,created_at)")
      .order("updated_at", { ascending: false })
  ]);

  if (usersResult.error) {
    console.warn(usersResult.error);
    setAdminMessage(`Could not load accounts: ${usersResult.error.message}`);
    return;
  }

  adminUsers = usersResult.data || [];
  renderAdminUsers();

  if (memoriesResult.error) {
    console.warn(memoriesResult.error);
    setAdminMessage(`Could not load all memories: ${memoriesResult.error.message}`);
    return;
  }

  const loadedMemories = await hydratePhotoUrls((memoriesResult.data || []).map(normalizeMemory));
  adminMemories = loadedMemories.map((memory) => {
    const ownMemory = memories.find((entry) => entry.id === memory.id);
    return ownMemory ? Object.assign(ownMemory, memory) : memory;
  });
  render();
}

async function updateAdminRole(userId, makeAdmin) {
  const { error } = await supabase.rpc("set_app_user_admin", {
    target_user_id: userId,
    make_admin: makeAdmin
  });

  if (error) {
    console.warn(error);
    setAdminMessage(`Could not update administrator access: ${error.message}`);
    return;
  }

  if (userId === user.id && !makeAdmin) {
    isAdmin = false;
    adminMemories = [];
    renderAuth();
    navigateToPage("community");
    return;
  }

  await loadAdminPage();
}

function openPhotoLightbox(trigger) {
  photoLightboxTrigger = trigger;
  photoLightboxImage.src = trigger.dataset.photoUrl;
  photoLightboxImage.alt = trigger.dataset.photoAlt;
  photoLightbox.showModal();
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest?.(".photo-thumbnail");
  if (trigger) {
    openPhotoLightbox(trigger);
    return;
  }

  if (event.target === photoLightbox) photoLightbox.close();
});

photoLightboxClose.addEventListener("click", () => photoLightbox.close());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && photoLightbox.open) {
    event.preventDefault();
    photoLightbox.close();
  }
});
photoLightbox.addEventListener("close", () => {
  photoLightboxImage.removeAttribute("src");
  if (photoLightboxTrigger?.isConnected) photoLightboxTrigger.focus();
  photoLightboxTrigger = null;
});

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
    communityMemories = visibleMemories;
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
    if (memory.user_id === user?.id) saveMemories();
    updateNetworkStatus("Local");
    return;
  }

  try {
    const values = {
      text: memory.text,
      notes: memory.notes,
      is_public: Boolean(memory.is_public),
      updated_at: memory.updated_at
    };
    const isAdminEditingAnotherUser = isAdmin && memory.user_id && memory.user_id !== user.id;
    const { data, error } = isAdminEditingAnotherUser
      ? await supabase
        .from("memories")
        .update(values)
        .eq("id", memory.id)
        .select()
      : await supabase
        .from("memories")
        .upsert(
          {
            id: memory.id,
            user_id: memory.user_id || user.id,
            ...values
          },
          { onConflict: "id" }
        )
        .select();

    if (error) throw error;
    if (isAdminEditingAnotherUser && !data?.length) {
      throw new Error("The memory could not be updated. Refresh and try again.");
    }

    memory.user_id = memory.user_id || user.id;
    memory.pending = false;
    if (memory.user_id === user.id) saveMemories();
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
    let memoryDelete = supabase
      .from("memories")
      .delete()
      .eq("id", id);
    if (!isAdmin) memoryDelete = memoryDelete.eq("user_id", user.id);
    const { error } = await memoryDelete;

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
  isAdmin = false;
  adminMemories = [];
  adminUsers = [];
  memories = loadMemories();
  pendingDeletes = loadPendingDeletes();
  setAdminMessage("");
  setNavigationMessage("");
  if (user) isAdmin = await loadAdminAccess();
  renderAuth();
  render();

  const requestedPage = new URLSearchParams(window.location.search).get("page") || "login";
  navigateToPage(requestedPage, true);

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
      redirectTo: new URL("?page=memories", window.location.href).toString()
    }
  });

  if (error) setAuthMessage(error.message);
}

memoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!user) {
    setAuthMessage("Sign in before managing memories.");
    return;
  }

  const text = memoryInput.value.trim();
  const notes = notesInput.value.trim();
  const photoFiles = [...selectedPhotoFiles];
  if (!text) return;

  if (editingFromAdmin && !navigator.onLine) {
    setAdminMessage("Connect to the internet before editing all memories.");
    return;
  }

  const returnToAdmin = editingFromAdmin;
  let memory = memories.find((entry) => entry.id === editingMemoryId)
    || adminMemories.find((entry) => entry.id === editingMemoryId);
  if (memory) {
    memory.text = text;
    memory.notes = notes;
    memory.updated_at = new Date().toISOString();
    memory.pending = true;
  } else {
    memory = {
      id: crypto.randomUUID(),
      user_id: user.id,
      text,
      notes,
      photos: [],
      updated_at: new Date().toISOString(),
      pending: true
    };
    memories.unshift(memory);
  }

  if (memory.user_id === user.id) {
    const ownIndex = memories.findIndex((entry) => entry.id === memory.id);
    if (ownIndex === -1) memories.unshift(memory);
    else memories[ownIndex] = memory;
    saveMemories();
  }
  render();
  await syncMemory(memory);
  await uploadPhotosForMemory(memory, photoFiles);
  resetMemoryEditor();
  render();
  if (returnToAdmin) navigateToPage("admin");
  else memoryInput.focus();
});

function findMemory(id) {
  return memories.find((memory) => memory.id === id)
    || adminMemories.find((memory) => memory.id === id);
}

for (const list of [memoryList, adminMemoryList]) {
  list.addEventListener("change", (event) => {
    const checkbox = event.target;
    if (!(checkbox instanceof HTMLInputElement) || !checkbox.classList.contains("share-toggle")) return;

    const memory = findMemory(checkbox.closest(".memory-item")?.dataset.id);
    if (!memory) return;

    memory.is_public = checkbox.checked;
    memory.updated_at = new Date().toISOString();
    if (memory.user_id === user?.id) saveMemories();
    render();
    syncMemory(memory).then(loadCommunityMemories);
  });

  list.addEventListener("click", (event) => {
    const button = event.target;
    if (!(button instanceof HTMLButtonElement)) return;

    const memoryId = button.closest(".memory-item")?.dataset.id;

    if (button.classList.contains("edit-memory-button")) {
      const memory = findMemory(memoryId);
      if (memory) editMemory(memory, list === adminMemoryList);
      return;
    }

    if (button.classList.contains("remove-photo-button")) {
      removePhoto(button.dataset.memoryId, button.dataset.photoId);
      return;
    }

    if (button.classList.contains("memory-photo-trigger")) {
      document.getElementById(button.dataset.target)?.click();
      return;
    }

    if (!button.classList.contains("delete-button")) return;

    const deletedMemory = findMemory(memoryId);
    memories = memories.filter((memory) => memory.id !== memoryId);
    adminMemories = adminMemories.filter((memory) => memory.id !== memoryId);
    if (deletedMemory?.user_id === user?.id) saveMemories();
    render();
    if (memoryId) deleteCloudMemory(memoryId, deletedMemory?.photos || []);
  });

  list.addEventListener("change", async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.classList.contains("memory-photo-input")) return;

    const memory = findMemory(input.dataset.memoryId);
    if (!memory) return;

    await uploadPhotosForMemory(memory, Array.from(input.files || []));
    input.value = "";
  });
}

cancelMemoryEditButton.addEventListener("click", () => {
  const returnToAdmin = editingFromAdmin;
  resetMemoryEditor();
  if (returnToAdmin) navigateToPage("admin");
});

adminUserList.addEventListener("click", async (event) => {
  const button = event.target;
  if (!(button instanceof HTMLButtonElement) || !button.classList.contains("admin-role-button")) return;
  button.disabled = true;
  await updateAdminRole(button.dataset.userId, button.dataset.makeAdmin === "true");
  if (button.isConnected) button.disabled = false;
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

for (const link of pageLinks) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    navigateToPage(link.dataset.pageLink);
  });
}

window.addEventListener("popstate", () => {
  const requestedPage = new URLSearchParams(window.location.search).get("page") || "login";
  navigateToPage(requestedPage, true);
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
