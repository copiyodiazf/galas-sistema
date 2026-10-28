import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'

// Una orden de compra: siempre de UN tipo de entrada (los define evento.json) y
// de 1 a MAX_ENTRADAS unidades. Así la compra es corta y el cupo se cuenta fácil.
const Orden = sequelize.define('Orden', {
  id:        { type: DataTypes.STRING, primaryKey: true },   // 'orden_<uuid>' = referenceId del cobro en Chytapay
  tipo:      { type: DataTypes.STRING(40), allowNull: false },
  nombre:    { type: DataTypes.STRING, allowNull: false },
  email:     { type: DataTypes.STRING, allowNull: false },
  dni:       { type: DataTypes.STRING, allowNull: true },
  // chytapay = online · punto = venta física (la carga un vendedor, al mismo precio final)
  // cortesia / prueba = no son venta
  metodo:    { type: DataTypes.STRING, defaultValue: 'chytapay' },
  vendedor:  { type: DataTypes.STRING, allowNull: true },    // usuario del punto de venta
  cobro:     { type: DataTypes.STRING, allowNull: true },    // en el punto: efectivo o transferencia
  cantidad:  { type: DataTypes.INTEGER, allowNull: false },
  subtotal:  { type: DataTypes.INTEGER, allowNull: false },  // entradas por su valor (lo de la academia)
  cargo:     { type: DataTypes.INTEGER, allowNull: false },  // costo de servicio
  total:     { type: DataTypes.INTEGER, allowNull: false },
  // 'reversada' = la plata se devolvió: la entrada deja de servir en la puerta.
  // 'abandonada' = venció sin pagar; si después entra el pago (la academia lo imputa a mano), se emite igual.
  estado:    { type: DataTypes.ENUM('pendiente', 'pagada', 'reversada', 'abandonada'), defaultValue: 'pendiente' },
  paymentId: { type: DataTypes.STRING, allowNull: true },    // paymentRequestId de Chytapay
  medioPago: { type: DataTypes.STRING, allowNull: true },
  pagador:   { type: DataTypes.STRING, allowNull: true },    // titular de la cuenta que transfirió (lo informa Chytapay)
  pagadaEn:  { type: DataTypes.DATE, allowNull: true },
  avisadoEn: { type: DataTypes.DATE, allowNull: true },      // recordatorio por compra a medio camino
}, {
  tableName: 'ordenes',
  timestamps: true,
  indexes: [{ fields: ['estado', 'createdAt'] }, { fields: ['email'] }, { fields: ['dni'] }, { fields: ['vendedor'] }],
})

export default Orden
