from django.db import models


def receipt_image_upload_dir(instance, filename):
    return f'receipt-images/{instance.pk or "new"}/{filename}'


class Receipt(models.Model):
    """
    Un ticket (o factura simplificada) de la compra, subido como foto.

    El camino de la foto a los datos tiene tres pasos, y el punto intermedio
    es a proposito un texto legible:

        foto  ->  `markdown`  ->  `parsed`  ->  Purchase + PurchaseItem

    `markdown` es el contrato: la transcripcion del ticket en texto. Puede
    llegar de una transcripcion automatica (vision/OCR, ver la nota en
    api/views.py sobre por que hoy es un proveedor enchufable y no algo fijo)
    o pegada/corregida a mano. Guardarlo como texto editable es lo que hace
    que el resto del sistema sea determinista y arreglable: si la
    transcripcion se equivoca en una linea, se corrige el texto y se vuelve a
    analizar, sin volver a fotografiar nada.

    `parsed` es el resultado de pasar ese texto por salaz/tickets.py, que es
    codigo puro y sin dependencias. Se guarda para poder revisarlo antes de
    confirmar: hasta que el usuario no confirma, un ticket no toca ni las
    compras ni la despensa.
    """

    PENDIENTE = 'pendiente'
    ANALIZADO = 'analizado'
    CONFIRMADO = 'confirmado'
    ERROR = 'error'

    ESTADO_CHOICES = [
        (PENDIENTE, 'Pendiente de analizar'),
        (ANALIZADO, 'Analizado, pendiente de confirmar'),
        (CONFIRMADO, 'Confirmado, ya volcado a la compra'),
        (ERROR, 'No se ha podido analizar'),
    ]

    household = models.ForeignKey(
        'salaz.Household',
        on_delete=models.CASCADE,
        related_name='receipts',
    )
    image = models.ImageField(upload_to=receipt_image_upload_dir, blank=True, null=True)
    #: Transcripcion del ticket. Es el contrato entre la foto y el parser, y
    #: se deja editable justo para poder corregir a mano lo que la
    #: transcripcion automatica lea mal.
    markdown = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=ESTADO_CHOICES, default=PENDIENTE)

    # Cabecera ya extraida, copiada aqui desde `parsed` para poder listar y
    # filtrar tickets sin abrir el JSON de cada uno.
    supermarket = models.CharField(max_length=200, blank=True, default='')
    date = models.DateField(null=True, blank=True)
    total = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    #: Salida de salaz.tickets.a_json(): {supermarket, date, total, lines[], warnings[]}
    parsed = models.JSONField(default=dict, blank=True)
    #: Mensaje para el usuario cuando status == ERROR.
    error = models.TextField(blank=True, default='')

    #: La compra creada al confirmar. OneToOne: un ticket es una compra, y
    #: tenerlo aqui es lo que deja que confirmar dos veces no duplique nada.
    #: SET_NULL en vez de CASCADE: si se borra la compra a mano desde
    #: Compras, el ticket (y su foto, que es el justificante) se queda.
    purchase = models.OneToOneField(
        'salaz.Purchase',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='receipt',
    )

    created = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created']

    def __str__(self):
        etiqueta = self.supermarket or 'Ticket'
        return f'{etiqueta} ({self.date or "sin fecha"})'

    def get_owner_object(self):
        return self.household
