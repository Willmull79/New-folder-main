import React, { useState, useRef } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';

export const Avatar = ({
    docRefPath,
    storagePath,
    currentAvatarUrl,
    showMessage,
    size = 'h-16 w-16',
    editable = true,
    onAvatarUpdated,
}) => {
    const { db, storage } = useFirebase();
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileSelect = () => {
        fileInputRef.current.click();
    };

    const handleImageUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            return showMessage('Please select an image file.', 'error');
        }

        setIsUploading(true);
        const uniqueFileName = `${Date.now()}-${file.name}`;
        const imageRef = storage.ref(`${storagePath}/${uniqueFileName}`);

        try {
            const snapshot = await imageRef.put(file);
            const downloadURL = await snapshot.ref.getDownloadURL();

            const docRef = db.doc(docRefPath);
            await docRef.set({ avatarUrl: downloadURL }, { merge: true });

            if (onAvatarUpdated) {
                await onAvatarUpdated(downloadURL);
            }

            showMessage('Avatar updated successfully!', 'success');
        } catch (error) {
            console.error('Error uploading image:', error);
            showMessage('Failed to upload avatar.', 'error');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI0EwQUVCQiI+PHBhdGggZD0iTTEyIDJDNi44OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTAgM2MxLjY2IDAgMyAxLjM0IDMgM3MtMS4zNCAzLTMgMy0zLTEuMzQtMy0zIDEuMzQtMyAzLTN6bTAgMTRjLTIuMDMgMC0zLjg0LS44Ny01LjE5LTIuMzJDOC4wMSAxNi4wMSA5LjkyIDE1IDEyIDE1czMuOTkgMS4wMSA1LjE5IDIuNjljLTEuMzYgMS40NC0zLjE2IDIuMzEtNS4xOSAyLjMxeiIvPjwvc3ZnPg==';

    return (
        <div className={`relative ${size} flex-shrink-0`}>
            <img
                src={currentAvatarUrl || defaultAvatar}
                alt="Avatar"
                className="rounded-full h-full w-full object-cover border-2 border-gray-600"
            />
            {isUploading ? (
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-full">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-white"></div>
                </div>
            ) : editable ? (
                <>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*"
                        className="hidden"
                    />
                    <button type="button" onClick={handleFileSelect} title="Change Avatar" className="avatar-upload-btn">
                        ✏️
                    </button>
                </>
            ) : null}
        </div>
    );
};
