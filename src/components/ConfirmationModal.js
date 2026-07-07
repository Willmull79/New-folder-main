import React from 'react';

export const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, children }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 modal-enter-active">
            <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md border border-red-500">
                <h3 className="text-2xl font-bold mb-4 text-red-400">{title}</h3>
                <div className="text-gray-300 mb-6">{children}</div>
                <div className="flex justify-end gap-4">
                    <button onClick={onClose} className="px-6 py-2 bg-gray-600 hover:bg-gray-500 rounded-md font-semibold">Cancel</button>
                    <button onClick={onConfirm} className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-md font-semibold">Confirm</button>
                </div>
            </div>
        </div>
    );
}; 